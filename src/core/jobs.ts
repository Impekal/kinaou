export type JobState = 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled'

export interface Job<TInput = unknown, TOutput = unknown> {
  id: string
  type: string
  state: JobState
  input: TInput
  output?: TOutput
  error?: string
  progress: number
  createdAt: string
  updatedAt: string
}

export interface JobRunner<TInput = unknown, TOutput = unknown> {
  type: string
  run(input: TInput, signal: AbortSignal, report: (progress: number) => void): Promise<TOutput>
}

export class JobQueue {
  private readonly runners = new Map<string, JobRunner>()
  private readonly controllers = new Map<string, AbortController>()
  private readonly jobs = new Map<string, Job>()

  register(runner: JobRunner): void {
    this.runners.set(runner.type, runner)
  }

  enqueue<TInput>(type: string, input: TInput): Job<TInput> {
    const now = new Date().toISOString()
    const job: Job<TInput> = { id: crypto.randomUUID(), type, state: 'queued', input, progress: 0, createdAt: now, updatedAt: now }
    this.jobs.set(job.id, job)
    return structuredClone(job)
  }

  get(jobId: string): Job | undefined {
    const job = this.jobs.get(jobId)
    return job ? structuredClone(job) : undefined
  }

  list(): Job[] {
    return [...this.jobs.values()].map((job) => structuredClone(job))
  }

  async run(jobId: string): Promise<Job> {
    const job = this.jobs.get(jobId)
    if (!job) throw new Error(`Job not found: ${jobId}`)
    const runner = this.runners.get(job.type)
    if (!runner) throw new Error(`No runner registered for job type: ${job.type}`)
    const controller = new AbortController()
    this.controllers.set(jobId, controller)
    job.state = 'running'
    job.updatedAt = new Date().toISOString()
    try {
      job.output = await runner.run(job.input, controller.signal, (progress) => {
        job.progress = Math.max(0, Math.min(1, progress))
        job.updatedAt = new Date().toISOString()
      })
      job.progress = 1
      job.state = 'succeeded'
    } catch (error) {
      if (controller.signal.aborted) job.state = 'cancelled'
      else {
        job.state = 'failed'
        job.error = error instanceof Error ? error.message : String(error)
      }
    } finally {
      job.updatedAt = new Date().toISOString()
      this.controllers.delete(jobId)
    }
    return structuredClone(job)
  }

  cancel(jobId: string): void {
    this.controllers.get(jobId)?.abort()
  }
}
