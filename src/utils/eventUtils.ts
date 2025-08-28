import { Event, EventForm, RepeatType } from '../types';
import { getWeekDates, isDateInRange } from './dateUtils';

function formatDateToString(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

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
    : new Date('2025-10-31'); // 1년 후까지

  const { type, interval } = eventData.repeat;

  // ✅ 매월 반복 특별 처리
  if (type === 'monthly') {
    const originalDay = startDate.getDate();
    let year = startDate.getFullYear();
    let month = startDate.getMonth();

    let loopCount = 0;
    while (loopCount < 100) {
      // 안전장치
      // 해당 월의 일수 확인
      const daysInMonth = new Date(year, month + 1, 0).getDate();

      // 31일 규칙: 해당 월에 원래 날짜가 있는지 확인
      if (originalDay <= daysInMonth) {
        const instanceDate = new Date(year, month, originalDay);

        if (instanceDate <= endDate) {
          instances.push({
            ...eventData,
            date: formatDateToString(instanceDate),
          });
        } else {
          break;
        }
      }

      // 다음 달로
      month += interval;
      while (month > 11) {
        month -= 12;
        year++;
      }

      loopCount++;
    }
  } else if (type === 'yearly') {
    // ✅ 매년 반복 특별 처리 (윤년 고려)
    const originalMonth = startDate.getMonth();
    const originalDay = startDate.getDate();
    let year = startDate.getFullYear();

    let loopCount = 0;
    while (loopCount < 100) {
      // 윤년 2월 29일 처리
      if (originalMonth === 1 && originalDay === 29) {
        // 2월 29일인 경우, 윤년에만 생성
        if (isLeapYear(year)) {
          const instanceDate = new Date(year, originalMonth, originalDay);

          if (instanceDate <= endDate) {
            instances.push({
              ...eventData,
              date: formatDateToString(instanceDate),
            });
          } else {
            break;
          }
        }
      } else {
        // 일반적인 경우
        const instanceDate = new Date(year, originalMonth, originalDay);

        if (instanceDate <= endDate) {
          instances.push({
            ...eventData,
            date: formatDateToString(instanceDate),
          });
        } else {
          break;
        }
      }

      // 다음 해로
      year += interval;
      loopCount++;
    }
  } else {
    // 기존 로직 (daily, weekly)
    let currentDate = new Date(startDate);
    let loopCount = 0;

    while (currentDate <= endDate) {
      loopCount++;

      // 31일 매월, 윤년 규칙 체크
      const shouldCreate = shouldCreateInstance(currentDate, startDate, type);

      if (shouldCreate) {
        const instance = {
          ...eventData,
          date: formatDateToString(currentDate), // YYYY-MM-DD
          repeat: {
            ...eventData.repeat,
            // 반복 그룹 ID는 서버에서 설정
          },
        };

        instances.push(instance);
      }

      // 다음 날짜 계산
      const prevDate = new Date(currentDate);
      currentDate = getNextDate(currentDate, type, interval);

      // 무한 루프 방지
      if (instances.length > 365 || loopCount > 1000) {
        break;
      }

      // 날짜가 진행되지 않으면 중단 (무한루프 방지)
      if (currentDate.getTime() === prevDate.getTime()) {
        break;
      }
    }
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
    case 'monthly': {
      // 매월은 generateRepeatInstances에서 특별 처리하므로 여기서는 단순 처리
      const originalDay = date.getDate();
      const targetMonth = date.getMonth() + interval;
      const targetYear = date.getFullYear() + Math.floor(targetMonth / 12);
      const adjustedMonth = targetMonth % 12;

      // 해당 월의 최대 일수 확인
      const maxDayInMonth = new Date(targetYear, adjustedMonth + 1, 0).getDate();

      // 31일이 없는 달은 해당 월의 마지막 날로 설정하거나 건너뛰기
      if (originalDay <= maxDayInMonth) {
        nextDate.setFullYear(targetYear, adjustedMonth, originalDay);
      } else {
        // 31일이 없는 달 처리 (예: 2월에는 31일이 없으므로)
        nextDate.setFullYear(targetYear, adjustedMonth + 1, 0); // 해당 월 마지막 날
      }
      break;
    }
    case 'yearly':
      nextDate.setFullYear(date.getFullYear() + interval);
      break;
  }

  return nextDate;
}

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}
