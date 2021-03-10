import AbstractApp, { OptsType } from 'abstract-app'
import schedule, { Job } from 'node-schedule'

type TaskType = () => Promise<void>

export class HourlyCron extends AbstractApp {
  private job: Job | null = null
  private task: TaskType

  constructor(opts: { task: TaskType } & OptsType) {
    super({
      logger: opts.logger,
      stopTimeout: opts.stopTimeout,
    })
    this.task = opts.task
  }

  async _start() {
    if (this.job != null) return
    this.job = schedule.scheduleJob({ minute: 0 }, this.task)
  }

  async _stop() {
    if (this.job == null) return
    this.job.cancel()
    this.job = null
  }
}
