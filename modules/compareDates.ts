type Day = {
  year: number
  month: number
  date: number
}

export function compareDates(
  d1: Date,
  d2: Date,
  compare: (day1: Day, day2: Day) => boolean,
): boolean {
  return compare(
    {
      year: d1.getFullYear(),
      month: d1.getMonth(),
      date: d1.getDate(),
    },
    {
      year: d2.getFullYear(),
      month: d2.getMonth(),
      date: d2.getDate(),
    },
  )
}
