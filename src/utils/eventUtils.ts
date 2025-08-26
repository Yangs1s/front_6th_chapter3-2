import { Event, EventForm, RepeatType } from '../types';
import { getWeekDates, isDateInRange } from './dateUtils';

function filterEventsByDateRange(events: Event[], start: Date, end: Date): Event[] {
  return events.filter((event) => {
    const eventDate = new Date(event.date);
    return isDateInRange(eventDate, start, end);
  });
}

function containsTerm(target: string, term: string) {
  return target.toLowerCase().includes(term.toLowerCase());
}

function searchEvents(events: Event[], term: string) {
  return events.filter(
    ({ title, description, location }) =>
      containsTerm(title, term) || containsTerm(description, term) || containsTerm(location, term)
  );
}

function filterEventsByDateRangeAtWeek(events: Event[], currentDate: Date) {
  const weekDates = getWeekDates(currentDate);
  return filterEventsByDateRange(events, weekDates[0], weekDates[6]);
}

function filterEventsByDateRangeAtMonth(events: Event[], currentDate: Date) {
  const monthStart = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
  const monthEnd = new Date(
    currentDate.getFullYear(),
    currentDate.getMonth() + 1,
    0,
    23,
    59,
    59,
    999
  );
  return filterEventsByDateRange(events, monthStart, monthEnd);
}

export function getFilteredEvents(
  events: Event[],
  searchTerm: string,
  currentDate: Date,
  view: 'week' | 'month'
): Event[] {
  const searchedEvents = searchEvents(events, searchTerm);

  if (view === 'week') {
    return filterEventsByDateRangeAtWeek(searchedEvents, currentDate);
  }

  if (view === 'month') {
    return filterEventsByDateRangeAtMonth(searchedEvents, currentDate);
  }

  return searchedEvents;
}

export function generateRepeatInstances(eventData: EventForm): EventForm[] {
  if (eventData.repeat.type === 'none') {
    return [eventData];
  }

  const instances: EventForm[] = [];
  const startDate = new Date(eventData.date);
  const endDate = eventData.repeat.endDate
    ? new Date(eventData.repeat.endDate)
    : new Date(Date.now() + 365 * 24 * 60 * 60 * 1000); // 1년 후까지

  const { type, interval } = eventData.repeat;
  let currentDate = new Date(startDate);

  while (currentDate <= endDate) {
    // 31일 매월, 윤년 규칙 체크
    if (shouldCreateInstance(currentDate, startDate, type)) {
      instances.push({
        ...eventData,
        date: currentDate.toISOString().split('T')[0], // YYYY-MM-DD
        repeat: {
          ...eventData.repeat,
          // 반복 그룹 ID는 서버에서 설정
        },
      });
    }

    // 다음 날짜 계산
    currentDate = getNextDate(currentDate, type, interval);

    // 무한 루프 방지
    if (instances.length > 365) break;
  }

  return instances;
}

// 31일, 윤년 규칙 체크
function shouldCreateInstance(currentDate: Date, originalDate: Date, type: RepeatType): boolean {
  if (type === 'monthly') {
    // 31일 매월: 31일이 없는 달은 건너뛰기
    if (originalDate.getDate() === 31 && currentDate.getDate() !== 31) {
      return false;
    }
  }

  if (type === 'yearly') {
    // 윤년 2월 29일: 평년은 건너뛰기
    if (originalDate.getMonth() === 1 && originalDate.getDate() === 29) {
      if (!isLeapYear(currentDate.getFullYear())) {
        return false;
      }
    }
  }

  return true;
}

function getNextDate(date: Date, type: RepeatType, interval: number): Date {
  const nextDate = new Date(date);

  switch (type) {
    case 'daily':
      nextDate.setDate(date.getDate() + interval);
      break;
    case 'weekly':
      nextDate.setDate(date.getDate() + 7 * interval);
      break;
    case 'monthly':
      nextDate.setMonth(date.getMonth() + interval);
      break;
    case 'yearly':
      nextDate.setFullYear(date.getFullYear() + interval);
      break;
  }

  return nextDate;
}

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}
