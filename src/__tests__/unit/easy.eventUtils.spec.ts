import { Event, EventForm } from '../../types';
import { getFilteredEvents } from '../../utils/eventUtils';
import { generateRepeatInstances } from '../../utils/eventUtils';

describe('getFilteredEvents', () => {
  const events: Event[] = [
    {
      id: '1',
      title: '이벤트 1',
      date: '2025-07-01',
      startTime: '10:00',
      endTime: '11:00',
      description: '',
      location: '',
      category: '',
      repeat: { type: 'none', interval: 0 },
      notificationTime: 0,
    },
    {
      id: '2',
      title: '이벤트 2',
      date: '2025-07-05',
      startTime: '14:00',
      endTime: '15:00',
      description: '',
      location: '',
      category: '',
      repeat: { type: 'none', interval: 0 },
      notificationTime: 0,
    },
    {
      id: '3',
      title: '이벤트 3',
      date: '2025-07-10',
      startTime: '09:00',
      endTime: '10:00',
      description: '',
      location: '',
      category: '',
      repeat: { type: 'none', interval: 0 },
      notificationTime: 0,
    },
  ];

  it("검색어 '이벤트 2'에 맞는 이벤트만 반환한다", () => {
    const result = getFilteredEvents(events, '이벤트 2', new Date('2025-07-01'), 'month');
    expect(result).toHaveLength(1);
    expect(result[0].title).toBe('이벤트 2');
  });

  it('주간 뷰에서 2025-07-01 주의 이벤트만 반환한다', () => {
    const result = getFilteredEvents(events, '', new Date('2025-07-01'), 'week');
    expect(result).toHaveLength(2);
    expect(result.map((e) => e.title)).toEqual(['이벤트 1', '이벤트 2']);
  });

  it('월간 뷰에서 2025년 7월의 모든 이벤트를 반환한다', () => {
    const result = getFilteredEvents(events, '', new Date('2025-07-01'), 'month');
    expect(result).toHaveLength(3);
    expect(result.map((e) => e.title)).toEqual(['이벤트 1', '이벤트 2', '이벤트 3']);
  });

  it("검색어 '이벤트'와 주간 뷰 필터링을 동시에 적용한다", () => {
    const result = getFilteredEvents(events, '이벤트', new Date('2025-07-01'), 'week');
    expect(result).toHaveLength(2);
    expect(result.map((e) => e.title)).toEqual(['이벤트 1', '이벤트 2']);
  });

  it('검색어가 없을 때 모든 이벤트를 반환한다', () => {
    const result = getFilteredEvents(events, '', new Date('2025-07-01'), 'month');
    expect(result).toHaveLength(3);
  });

  it('검색어가 대소문자를 구분하지 않고 작동한다', () => {
    const result = getFilteredEvents(events, '이벤트 2', new Date('2025-07-01'), 'month');
    expect(result).toHaveLength(1);
    expect(result[0].title).toBe('이벤트 2');
  });

  it('월의 경계에 있는 이벤트를 올바르게 필터링한다', () => {
    const borderEvents: Event[] = [
      {
        id: '4',
        title: '6월 마지막 날 이벤트',
        date: '2025-06-30',
        startTime: '23:00',
        endTime: '23:59',
        description: '',
        location: '',
        category: '',
        repeat: { type: 'none', interval: 0 },
        notificationTime: 0,
      },
      ...events,
      {
        id: '5',
        title: '8월 첫 날 이벤트',
        date: '2025-08-01',
        startTime: '00:00',
        endTime: '01:00',
        description: '',
        location: '',
        category: '',
        repeat: { type: 'none', interval: 0 },
        notificationTime: 0,
      },
    ];
    const result = getFilteredEvents(borderEvents, '', new Date('2025-07-01'), 'month');
    expect(result).toHaveLength(3);
    expect(result.map((e) => e.title)).toEqual(['이벤트 1', '이벤트 2', '이벤트 3']);
  });

  it('빈 이벤트 리스트에 대해 빈 배열을 반환한다', () => {
    const result = getFilteredEvents([], '', new Date('2025-07-01'), 'month');
    expect(result).toHaveLength(0);
  });
});

describe('generateRepeatInstances', () => {
  // 🔥 핵심 테스트들
  it('단일 일정(repeat.type: none)일 때 원본 이벤트 하나만 반환한다', () => {
    const eventData: EventForm = {
      title: '회의',
      date: '2024-01-15',
      startTime: '10:00',
      endTime: '11:00',
      description: '',
      location: '',
      category: '업무',
      repeat: { type: 'none', interval: 1 },
      notificationTime: 10,
    };

    const result = generateRepeatInstances(eventData);

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual(eventData);
  });

  it('31일 매월 반복에서 31일이 없는 달은 건너뛴다', () => {
    const eventData: EventForm = {
      title: '월말 회의',
      date: '2024-01-31', // 1월 31일
      startTime: '10:00',
      endTime: '11:00',
      description: '',
      location: '',
      category: '업무',
      repeat: {
        type: 'monthly',
        interval: 1,
        endDate: '2024-06-30', // 6개월 후까지
      },
      notificationTime: 10,
    };

    const result = generateRepeatInstances(eventData);

    // 1월(31), 3월(31), 5월(31)만 생성되어야 함 (2월, 4월, 6월은 31일 없음)
    expect(result).toHaveLength(3);
    expect(result.map((r) => r.date)).toEqual(['2024-01-31', '2024-03-31', '2024-05-31']);
  });

  it('윤년 2월 29일 매년 반복은 윤년에만 생성된다', () => {
    const eventData: EventForm = {
      title: '윤년 기념일',
      date: '2024-02-29', // 윤년
      startTime: '12:00',
      endTime: '13:00',
      description: '',
      location: '',
      category: '기타',
      repeat: {
        type: 'yearly',
        interval: 1,
        endDate: '2030-02-28', // 6년 후까지
      },
      notificationTime: 10,
    };

    const result = generateRepeatInstances(eventData);

    // 2024(윤년), 2028(윤년)만 생성되어야 함
    expect(result).toHaveLength(2);
    expect(result.map((r) => r.date)).toEqual(['2024-02-29', '2028-02-29']);
  });

  it('매주 반복이 정확한 간격으로 생성된다', () => {
    const eventData: EventForm = {
      title: '주간 회의',
      date: '2024-01-01', // 월요일
      startTime: '14:00',
      endTime: '15:00',
      description: '',
      location: '',
      category: '업무',
      repeat: {
        type: 'weekly',
        interval: 2, // 2주마다
        endDate: '2024-02-01',
      },
      notificationTime: 10,
    };

    const result = generateRepeatInstances(eventData);

    // 1/1, 1/15, 1/29 (2주 간격)
    expect(result).toHaveLength(3);
    expect(result.map((r) => r.date)).toEqual(['2024-01-01', '2024-01-15', '2024-01-29']);
  });

  it('종료일이 설정되면 그 이후로는 생성하지 않는다', () => {
    const eventData: EventForm = {
      title: '매일 운동',
      date: '2024-01-01',
      startTime: '07:00',
      endTime: '08:00',
      description: '',
      location: '',
      category: '개인',
      repeat: {
        type: 'daily',
        interval: 1,
        endDate: '2024-01-05', // 5일까지만
      },
      notificationTime: 10,
    };

    const result = generateRepeatInstances(eventData);

    expect(result).toHaveLength(5); // 1/1 ~ 1/5
    expect(result.map((r) => r.date)).toEqual([
      '2024-01-01',
      '2024-01-02',
      '2024-01-03',
      '2024-01-04',
      '2024-01-05',
    ]);
  });

  it('시간대 변환 없이 정확한 날짜 문자열을 생성한다', () => {
    const eventData: EventForm = {
      title: '테스트',
      date: '2025-08-31', // 우리가 고친 문제!
      startTime: '23:59',
      endTime: '23:59',
      description: '',
      location: '',
      category: '업무',
      repeat: { type: 'none', interval: 1 },
      notificationTime: 10,
    };

    const result = generateRepeatInstances(eventData);

    // 31일이 30일로 변환되지 않아야 함
    expect(result[0].date).toBe('2025-08-31');
  });
});
