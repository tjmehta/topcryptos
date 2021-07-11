export function ceilHour(date: Date): Date {
  const out = new Date(date.toISOString().slice(0, -10) + '00:00.000Z')
  out.setHours(out.getHours() + 1)
  return out
}

export function floorHour(date: Date): Date {
  return new Date(date.toISOString().slice(0, -10) + '00:00.000Z')
}

export function roundToHour(date: Date): Date {
  if (date.getMinutes() >= 30) {
    return ceilHour(date)
  } else {
    return floorHour(date)
  }
}

export function setHour(date: Date, hour: number): Date {
  return new Date(date.toISOString().slice(0, -13) + `${hour}:00:00.000Z`)
}
