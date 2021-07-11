import AbstractApp, { OptsType } from 'abstract-app'

import AbortController from 'fast-abort-controller'
import { LoggerType } from 'abstract-startable'
import interval from 'abortable-interval'
import { roundToHour } from '../../modules/roundToHour'
import timeout from 'abortable-timeout'

type TaskType = () => Promise<void>

export class HourlyCron extends AbstractApp {
  private _logger: LoggerType & {
    warn: (...args: Array<any>) => void
    info: (...args: Array<any>) => void
  }
  private task: TaskType
  private taskPromise: ReturnType<TaskType> | null = null
  private abortController: AbortController | null = null
  private lastRunDate: Date | null = null

  constructor(opts: { task: TaskType } & OptsType) {
    super({
      logger: opts.logger,
      stopTimeout: opts.stopTimeout,
    })
    this.task = opts.task
    this._logger = opts.logger as any
  }

  private _handleInterval = async () => {
    if (this.taskPromise != null) {
      this._logger.warn('task still running', { date: new Date() })
      return
    }

    const now = new Date()
    const nowRoundedToHour = roundToHour(now)
    if (this.lastRunDate == null) {
      this._logger.info('skip first run', { date: new Date() })
      this.lastRunDate = nowRoundedToHour
      return
    }
    if (this.lastRunDate != null) {
      if (this.lastRunDate.toString() === nowRoundedToHour.toString()) {
        // this._logger.info(
        //   'equal',
        //   this.lastRunDate.toString(),
        //   nowRoundedToHour.toString(),
        // )
        return
      }
      if (this.lastRunDate > nowRoundedToHour) {
        // this._logger.info(
        //   'gte',
        //   this.lastRunDate.toString(),
        //   nowRoundedToHour.toString(),
        // )
        return
      }
    }
    if (now.getMinutes() > 15) {
      // this._logger.info('min too big', now.getMinutes(), 15)
      return
    }

    try {
      // run task
      this._logger.info('running task', {
        date: new Date(),
        rounded: nowRoundedToHour,
        lastRunDate: this.lastRunDate,
      })
      this.lastRunDate = nowRoundedToHour
      this.taskPromise = this.task()
      await this.taskPromise
    } catch (err) {
      // task errored, wait 30 sec and try again
      this._logger.error('task failed', { date: new Date(), err })
      await timeout(30 * 1000, this.abortController.signal)
      this.lastRunDate = null
    } finally {
      // task finished, clear promise
      this._logger.info('task finished')
      this.taskPromise = null
    }
  }

  async _start() {
    if (this.abortController != null) return
    // start task interval
    this.abortController = new AbortController()
    const now = new Date()
    const seconds = now.getSeconds()
    timeout((60 - seconds) * 1000, this.abortController.signal).then(() => {
      interval(15 * 1000, this.abortController.signal, this._handleInterval)
    })
  }

  async _stop() {
    if (this.abortController == null) return
    // stop task interval
    this.abortController.abort()
    this.abortController = null
  }
}
