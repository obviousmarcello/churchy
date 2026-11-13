export type ScheduleErrorCode =
  | "INVALID_DATE"
  | "INVALID_TIME"
  | "INVALID_DATETIME"
  | "INVALID_ARGUMENT"
  | "RANGE_INVERTED"
  | "RANGE_TOO_LARGE";

/** Typed error thrown by the schedule engine for invalid arguments or input. */
export class ScheduleError extends Error {
  readonly code: ScheduleErrorCode;

  constructor(code: ScheduleErrorCode, message: string) {
    super(message);
    this.name = "ScheduleError";
    this.code = code;
  }
}
