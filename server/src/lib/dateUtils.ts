export function toYMD(d: Date) {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function getFutureDates(recurrence: string, fromDate: Date, daysAhead: number = 30, includeFromDate: boolean = true): string[] {
  const dates: string[] = [];
  const limit = new Date(fromDate);
  limit.setDate(limit.getDate() + daysAhead);

  let current = new Date(fromDate);
  if (!includeFromDate) current.setDate(current.getDate() + 1);

  if (recurrence === 'daily') {
    while (current <= limit) {
      dates.push(toYMD(current));
      current.setDate(current.getDate() + 1);
    }
  } else if (recurrence === 'weekly') {
    const dow = current.getDay() || 7;
    while (current <= limit) {
      if ((current.getDay() || 7) === dow) dates.push(toYMD(current));
      current.setDate(current.getDate() + 1);
    }
  } else if (recurrence === 'monthly') {
    const dom = current.getDate();
    while (current <= limit) {
      if (current.getDate() === dom) dates.push(toYMD(current));
      current.setDate(current.getDate() + 1);
    }
  } else if (recurrence.startsWith('weekly-')) {
    const allowed = recurrence.split('-')[1].split(',').map(Number);
    while (current <= limit) {
      const dow = current.getDay() || 7;
      if (allowed.includes(dow)) {
        dates.push(toYMD(current));
      }
      current.setDate(current.getDate() + 1);
    }
  }
  return dates;
}
