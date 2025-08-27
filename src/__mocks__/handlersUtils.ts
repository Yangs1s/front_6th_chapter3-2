import { http, HttpResponse } from 'msw';

import { server } from '../setupTests';
import { Event } from '../types';

// ! Hard 여기 제공 안함
export const setupMockHandlerCreation = (initEvents = [] as Event[]) => {
  const mockEvents: Event[] = [...initEvents];

  server.use(
    http.get('/api/events', () => {
      return HttpResponse.json({ events: mockEvents });
    }),
    http.post('/api/events', async ({ request }) => {
      const newEvent = (await request.json()) as Event;
      newEvent.id = String(mockEvents.length + 1); // 간단한 ID 생성
      mockEvents.push(newEvent);
      return HttpResponse.json(newEvent, { status: 201 });
    })
  );
};

export const setupMockHandlerUpdating = () => {
  const mockEvents: Event[] = [
    {
      id: '1',
      title: '기존 회의',
      date: '2025-10-15',
      startTime: '09:00',
      endTime: '10:00',
      description: '기존 팀 미팅',
      location: '회의실 B',
      category: '업무',
      repeat: { type: 'none', interval: 0 },
      notificationTime: 10,
    },
    {
      id: '2',
      title: '기존 회의2',
      date: '2025-10-15',
      startTime: '11:00',
      endTime: '12:00',
      description: '기존 팀 미팅 2',
      location: '회의실 C',
      category: '업무',
      repeat: { type: 'none', interval: 0 },
      notificationTime: 10,
    },
  ];

  server.use(
    http.get('/api/events', () => {
      return HttpResponse.json({ events: mockEvents });
    }),
    http.put('/api/events/:id', async ({ params, request }) => {
      const { id } = params;
      const updatedEvent = (await request.json()) as Event;
      const index = mockEvents.findIndex((event) => event.id === id);

      mockEvents[index] = { ...mockEvents[index], ...updatedEvent };
      return HttpResponse.json(mockEvents[index]);
    })
  );
};

export const setupMockHandlerDeletion = () => {
  const mockEvents: Event[] = [
    {
      id: '1',
      title: '삭제할 이벤트',
      date: '2025-10-15',
      startTime: '09:00',
      endTime: '10:00',
      description: '삭제할 이벤트입니다',
      location: '어딘가',
      category: '기타',
      repeat: { type: 'none', interval: 0 },
      notificationTime: 10,
    },
  ];

  server.use(
    http.get('/api/events', () => {
      return HttpResponse.json({ events: mockEvents });
    }),
    http.delete('/api/events/:id', ({ params }) => {
      const { id } = params;
      const index = mockEvents.findIndex((event) => event.id === id);

      mockEvents.splice(index, 1);
      return new HttpResponse(null, { status: 204 });
    })
  );
};

// 일괄(batch) CUD 전용 핸들러들 (/api/events-list)

// CREATE: /api/events-list (배열 생성)
export const setupMockHandlerBatchCreation = (initEvents = [] as Event[]) => {
  const mockEvents: Event[] = [...initEvents];

  server.use(
    // 공용 조회
    http.get('/api/events', () => {
      return HttpResponse.json({ events: mockEvents });
    }),
    // 일괄 생성
    http.post('/api/events-list', async ({ request }) => {
      const body = (await request.json()) as { events: Event[] };
      const repeatId = `repeat-${Date.now()}`;

      const newEvents = body.events.map((event, idx) => {
        const isRepeatEvent = event.repeat?.type && event.repeat.type !== 'none';
        return {
          ...event,
          id: String(mockEvents.length + idx + 1),
          repeat: {
            ...event.repeat,
            id: isRepeatEvent ? repeatId : undefined,
          },
        } as Event;
      });

      mockEvents.push(...newEvents);
      return HttpResponse.json(newEvents, { status: 201 });
    })
  );
};

export const setupMockHandlerRepeatCreationAndUpdate = () => {
  const mockEvents: Event[] = [];

  server.use(
    // 조회
    http.get('/api/events', () => {
      return HttpResponse.json({ events: mockEvents });
    }),
    // 반복일정 생성
    http.post('/api/events-list', async ({ request }) => {
      const body = (await request.json()) as { events: Event[] };
      const repeatId = `repeat-${Date.now()}`;

      const newEvents = body.events.map((event, idx) => {
        const isRepeatEvent = event.repeat?.type && event.repeat.type !== 'none';
        return {
          ...event,
          id: String(mockEvents.length + idx + 1),
          repeat: {
            ...event.repeat,
            id: isRepeatEvent ? repeatId : undefined,
          },
        } as Event;
      });

      mockEvents.push(...newEvents);
      return HttpResponse.json(newEvents, { status: 201 });
    }),
    // 단일 수정
    http.put('/api/events/:id', async ({ params, request }) => {
      const { id } = params;
      const updatedEvent = (await request.json()) as Event;
      const index = mockEvents.findIndex((event) => event.id === id);

      if (index > -1) {
        mockEvents[index] = { ...mockEvents[index], ...updatedEvent };
        return HttpResponse.json(mockEvents[index]);
      }
      return new HttpResponse('Event not found', { status: 404 });
    })
  );
};

export const setupMockHandlerRepeatDeletion = () => {
  const mockEvents: Event[] = [];

  server.use(
    http.get('/api/events', () => {
      return HttpResponse.json({ events: mockEvents });
    }),
    http.post('/api/events-list', async ({ request }) => {
      const body = (await request.json()) as { events: Event[] };
      const repeatId = `repeat-${Date.now()}`;

      const newEvents = body.events.map(
        (event, idx) =>
          ({
            ...event,
            id: String(mockEvents.length + idx + 1),
            repeat: { ...event.repeat, id: repeatId },
          }) as Event
      );

      mockEvents.push(...newEvents);
      return HttpResponse.json(newEvents, { status: 201 });
    }),
    http.delete('/api/events/:id', ({ params }) => {
      const { id } = params;
      const index = mockEvents.findIndex((event) => event.id === id);

      if (index > -1) {
        mockEvents.splice(index, 1);
        return new HttpResponse(null, { status: 204 });
      }
      return new HttpResponse('Event not found', { status: 404 });
    })
  );
};
