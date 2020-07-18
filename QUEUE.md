Minimal Serverless Computing Job Queue
======================================

Overview
--------

Provides for asynchronous, durable job queueing and execution.

Core Concepts
-------------

* *task*  a distinct computation defined to process data. Tasks are identified by their _type_,
  (same as the _jobtype_) and _lang_ (eg `node`, `http`).
* *job* is a jobtype + payload combination, either as data waiting to be run, or as a running process
* *jobtype* task identifier.  Multi-tenancy is supported.
  The jobtype gets combined with the client id.
  Jobs are always segregated by client, optionally also by jobtype.
* *payload* is the newline-terminated serialized string passed to the task
* _eligible_ jobs may be run if, and only if, their date dt has come and they have no owner
* _job versioning_ is done by embedding the version number into the task name
* _logging_ should record jobs entering, running and completing
* _analytics_ is supported via the queue logfiles, it is not a built-in feature

### Job

* a *job* is associated with an `id`, a job `type`, a date `dt` and a _lock owner_ `lock`.  The id is the job id, the type the jobtype.
  Additional properties such as `create_dt`, `done_dt` may be supported but are not required.
  (Note that create_dt would be needed to time out retries, and/or a retry_count would be
  needed to limit retries by count instead.)
* the job *id* is a store-wide unique string that identifies the job payload
* the jobtype *type* identifies the _task_ that will process the _payload_
* the date *dt* is when the job is first eligible to run
* the *lock* is set to non-empty if the job has been claimed by a daemon.  Locked jobs
  are under the control of the locking daemon and are not eligible to be run.
  The lock value is the sysid of the owner
* the *data* field holds the payload.  Internally the store may choose to separate the job metadata and payload,
  but in code the job object has it all.
* optional fields *create_dt*, *done_dt*
* *locked* jobs have been claimed by a runner 
* *owner* is the _daemon_ that has the _lock_ (whose sysid is stored in the lock field).
  If empty, the job is not owned.

### Job Lifecycle

- job is created with `dt` = datetime when eligible to run, `lock` = (empty string)
- job picked to run with `dt` = run timeout, `lock` = sysid of daemon running it
- while running, the owner must refresh the lock `dt` so it never expires
- locked job whose lock expires (`dt` falls behind current datetime) gets its lock reset
  by the other queue daemons to be run again
- once done, the job can be deleted or archived.  Archival is achieved by setting the job `dt`
  to 1000 years past the finish time and the lock owner to the string `__done`.  Note that
  job archival requires indexed access to the jobtypes in the store.

Organization
------------

- *daemon* is a job execution engine.  One or more daemons connect to each store.
- *scheduler* selects which jobs to run next
- *runner* provides the job execution environment.  Runners could be shared by daemons.
* *store* is the repository of jobs
* *sysid* is the queue daemon identifier.  Sysids must be unique within each job store, ie
  daemons must all have distinct sysids to access the same store.  Two daemons are permitted to have the
  same sysid if they cannot access any of the same stores, even if other daemons have simultaneous access
  to both of their stores.  The sysid needs to prevent ambiguity of lock ownership within
  a store, but it is not required to be system-wide unique. (It can be nice if it is, though)
* a _partitioned store_ is a queue with stores, some of which are not reachable

Flow
----

- jobs are added with jobtype and payload (newline terminated string).  Any daemon can accept and add jobs.
- jobtype is annotated with tenant id, and timestamp|jobtype|payload is appended to durable journal
- the journal is a local file.  New jobs are appended to the end, jobs are ingested by reading from the front.
  The file is periodically rotated (or compacted).  (Hash can be used to erase ingested lines.)
- journal is ingested and stored into the shared store
- store is examined by the queue daemon(s), each selecting small batches of jobs to run
- batches are handed to runners that create execution contexts, run jobs, and persist the results.
  Different jobtypes are run in a different contexts, but contexts can and will be reused for the same jobtype.
  The runners may keep contexts around for eventual reuse, and may hint the scheduler as to what
  contexts are available for more optimal scheduling decisions.
- the results are written as newline terminated line to stdout as simplified `jobtype|payload` strings.
  The runners look for output lines starting with "`J: `" (uppercase J, a colon, then a space), and will
  send those lines to the journal to be converted into new jobs.  Other lines are assumed to be log lines
  or debug tracers and are ignored.
- jobs can return status and possibly data: RETRY=1xx, OK=2xx, FAILED=4xx, ERROR=5xx.
  `OK` and `FAILED` indicate normal termination.  `RETRY` and `ERROR` are tried again.
  Four completion statuses are used instead of two for better analytics.
- `OK` jobs ran ok and succeeded.  They are done.
- `FAILED` jobs ran ok but were unable to succeed (eg., due to data error).  They are done.
- `RETRY` jobs were unable to run to completion due to anticipated errors, but might if tried again.
  They will be run again after a delay.
- `ERROR` jobs encountered unexpected errors during execution.  They will be tried again after a delay.
  This attempts to work around transient errors that will resolve themselves, eg network connectivity
  or database load.
- job execution is designed to guarantee that the job will run to completion at least once.
  Completion means OK or FAILED; RETRY and ERROR are run again until the job finally times out.

Primary Components
------------------

### Queue

Orchestrates the activity.

- */{:client}/job/{:type}/add* insert jobs into the queue, return the created job ids
- */{:client}/handler/add/{:type}/add?method=* inserts a handler for the named job type
- */{:client}/handler/del/{:type}/delete* deletes the handler for job type
- */{:client}/handler/get/{:type}* returns the currently defined handler for the job type

### Journal

Checkpoints newly added job payloads for lower latencies and more efficient bulk store inserts.

- *write( jobtype, lines, [callback] )* add jobs to the queue.  Lines is an array of
  newline terminated stringified job payloads.  Each line will be appended to
  the journal in normalized `timestamp|tenant-jobtype|payload` format.
- *wsync( callback )* wait until the current writes in progress have been persisted
- *token = readReserve( lineCount, readTimeoutMs )* register an intent to consume lines from the journal.
  Once reserved, the read must be completed and synced withint timeout milliseconds,
  else the lines rae returned to the journal to be read again.
- *read( token, callback )* fetch the reserved lines
- *rsync( token )* tell the journal the read was persisted in the store ie that the
  logical read point can be advanced past the read lines.

Data format:

    #:Batch date=2020-06-30T01:17:17.123Z,bytes=12345,jobtype=client-job-type\n
    <body as received in the post request>
    #:EndBatch\n
    <id>|<jobtype>|<payload>
    ...

Notes:
- Disallow commas in jobtypes?
- Byte-count all payloads to allow arbitrary binary data?
- make scheduler query store directly for waiting jobtypes?  Just return metadata and jobs to queue to pass to runner.
  (Could also attach runner to scheduler... no)

### Store

Repository of task and payload data.  Tasks definitions persist until deleted,
job data and payloads until job completion or timeout.

- *setHandler( jobtype, lang, body )* define the task that will process the job payload
- *getHandler( jobtype )* retrieve the function body to run jobtype
- *deleteHandler( jobtype )* undefine the task.  Jobs without a task body are retried
  until they time out.

- *[types, typeCounts] = getWaitingJobtypes( )* returns an array whose first element is the
  array of jobtypes of the jobs that the store considers ready to run.  These are jobtypes that
  can be run at the time of the call.  The scheduler uses these jobtypes to choose which type to
  run next.  The second array element, if provided, is a hash mapping jobtype to count of
  waiting jobs.
- *getWaitingJobs( jobtype, limit )* return the jobs and make them ineligible for selection.
  The store retains the jobs in case the runner does not finish of them, in which case
  they time out and are made eligible to run again.
- *releaseJobs( ids, how )* dispose of the running jobs.  How can be `retry`
  (meaning try again after a short delay), `unget` (meaning try again asap), or `archive`
  (meaning delete or archive.  Archival marks the jobs as ineligible to run, but are
  retained for debugging or analytics.  Old archived jobs are periodically purged).

Notes:
- implementations may need to split out bulk data from jobs table, to work around e.g. beanstalkd
  or mongodb max object size limitations.

## Handler Store

- *id* unique handler id, for cleaning up old versions
- *type* jobtype (tenant+funcName tuple)
- *dt*   create date, used to find newest version
- *lock* job owner (?? tenant id? user id?)
- *data* handler function

Data is a json object of strings:
- *eid* compatible engine id, for reusing a runner context for multiple jobtypes
- *lang* language (node, http, php, etc)
- *before* runtime env bootstrap script, in same lang as body, prorated against tasks run
  (base env cost is not? or is too, since must fork?).  Total task limit is configured.  Optional.
- *beforeEach* per-batch init script, prorated against batch jobs.  Optional.
- *body* function body (or url that runs the script)
- *afterEach* per-batch cleanup script, prorated against batch jobs.  Optional.

### State

Keeps per-store global state.  Could be combined with Results, see below.

- sysid store (token store):
  Could implement in job store as type: 'queue.sysid', id: <sysid>, lock: <sysid>)
  - *reserveSysid( tempid, callback)*
  - *renewSysid( sysid, callback )*
  - *releaseSysid( sysid, callback )*
- jobs `running`/`done`/`waiting` (by type?) (parallel calls to scheduler: jobsStarted/jobsDone

### Scheduler

The scheduler chooses which jobtypes to run whenever there are resources available to run more
jobs.  It is updated with information about which jobtypes are running so it can incorporate
that into its picks.

- *selectJobtypeToRun( jobtypes [,jobcounts] )* given the jobtypes that are currently waiting to run,
  recommend the type to run next.  `jobcounts`, if passed, is a hash of numbers indexed by _jobtype_,
  where the counts are representative of the number of jobs of that type.  (The actual values
  can be current counts, estimates, or even weighted constants.  The scheduler is free to use
  the count information as it wants, even to ignore it altogether.)
- *jobsStarted( jobtype, count )* a batch of _count_ jobs started running
- *jobsStopped( jobtype, count )* a batch of _count_ jobs stopped running.
  The jobs need not all have finished (they may be retried later), but they are no longer running.

### Results

Scoreboard of completion stauts and results.

- `jobId => exitcode` mapping
- store up to 16MB result? (MEDIUMBLOB)
- option to automatically chain to a follow-on job that is queued with the completed job's returned results
- Result is written to stdout as a serialized journal entry: timestamp|type|payload
  (writing the output is wrappered to not allow editing of jobtypes)
- `code` is the reason the job stopped, `retry`, `ok`, `failed`, `error`
- `exitcode` is a numeric status : retry=1xx, ok=2xx, failed=4xx, error=5xx

### Runner

- *getRunningJobs* return the currently running jobs, to renew locks on
- *getStoppedJobs* return the jobs that are no longer running, annotated with `code` and `exitcode`

