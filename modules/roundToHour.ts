export function ceilHour(date: Date): Date {
  const out = new Date(date.toISOString().slice(0, -10) + '00:00.000Z')
  out.setHours(out.getHours() + 1)
  return out
}

export function floorHour(date: Date): Date {
  return new Date(date.toISOString().slice(0, -10) + '00:00.000Z')
}

export function roundToHour(date: Date): Date {
  if (date.getMinutes() > 50) {
    return ceilHour(date)
  } else if (date.getMinutes() < 10) {
    return floorHour(date)
  } else {
    throw new Error('Date is not near an hour')
  }
}

export function setHour(date: Date, hour: number): Date {
  return new Date(date.toISOString().slice(0, -13) + `${hour}:00:00.000Z`)
}
