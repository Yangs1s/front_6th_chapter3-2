import { act, renderHook } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { describe } from 'vitest';

import {
  setupMockHandlerBatchCreation,
  setupMockHandlerBatchUpdating,
  setupMockHandlerCreation,
  setupMockHandlerDeletion,
  setupMockHandlerUpdating,
} from '../../__mocks__/handlersUtils.ts';
import { useEventOperations } from '../../hooks/useEventOperations.ts';
import { server } from '../../setupTests.ts';
import { Event, EventForm } from '../../types.ts';

const enqueueSnackbarFn = vi.fn();

vi.mock('notistack', async () => {
  const actual = await vi.importActual('notistack');
  return {
    ...actual,
    useSnackbar: () => ({
      enqueueSnackbar: enqueueSnackbarFn,
    }),
  };
});

it('저장되어있는 초기 이벤트 데이터를 적절하게 불러온다', async () => {
  const { result } = renderHook(() => useEventOperations(false));

  await act(() => Promise.resolve(null));

  expect(result.current.events).toEqual([
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
  ]);
});

it('정의된 이벤트 정보를 기준으로 적절하게 저장이 된다', async () => {
  setupMockHandlerCreation(); // ? Med: 이걸 왜 써야하는지 물어보자

  const { result } = renderHook(() => useEventOperations(false));

  await act(() => Promise.resolve(null));

  const newEvent: Event = {
    id: '1',
    title: '새 회의',
    date: '2025-10-16',
    startTime: '11:00',
    endTime: '12:00',
    description: '새로운 팀 미팅',
    location: '회의실 A',
    category: '업무',
    repeat: { type: 'none', interval: 0 },
    notificationTime: 10,
  };

  await act(async () => {
    await result.current.saveEvent(newEvent, false);
  });

  expect(result.current.events).toEqual([{ ...newEvent, id: '1' }]);
});

it("새로 정의된 'title', 'endTime' 기준으로 적절하게 일정이 업데이트 된다", async () => {
  setupMockHandlerUpdating();

  const { result } = renderHook(() => useEventOperations(true));

  await act(() => Promise.resolve(null));

  const updatedEvent: Event = {
    id: '1',
    date: '2025-10-15',
    startTime: '09:00',
    description: '기존 팀 미팅',
    location: '회의실 B',
    category: '업무',
    repeat: { type: 'none', interval: 0 },
    notificationTime: 10,
    title: '수정된 회의',
    endTime: '11:00',
  };

  await act(async () => {
    await result.current.saveEvent(updatedEvent, false);
  });

  expect(result.current.events[0]).toEqual(updatedEvent);
});

it('존재하는 이벤트 삭제 시 에러없이 아이템이 삭제된다.', async () => {
  setupMockHandlerDeletion();

  const { result } = renderHook(() => useEventOperations(false));

  await act(async () => {
    await result.current.deleteEvent('1');
  });

  await act(() => Promise.resolve(null));

  expect(result.current.events).toEqual([]);
});

it("이벤트 로딩 실패 시 '이벤트 로딩 실패'라는 텍스트와 함께 에러 토스트가 표시되어야 한다", async () => {
  server.use(
    http.get('/api/events', () => {
      return new HttpResponse(null, { status: 500 });
    })
  );

  renderHook(() => useEventOperations(true));

  await act(() => Promise.resolve(null));

  expect(enqueueSnackbarFn).toHaveBeenCalledWith('이벤트 로딩 실패', { variant: 'error' });

  server.resetHandlers();
});

it("존재하지 않는 이벤트 수정 시 '일정 저장 실패'라는 토스트가 노출되며 에러 처리가 되어야 한다", async () => {
  const { result } = renderHook(() => useEventOperations(true));

  await act(() => Promise.resolve(null));

  const nonExistentEvent: Event = {
    id: '999', // 존재하지 않는 ID
    title: '존재하지 않는 이벤트',
    date: '2025-07-20',
    startTime: '09:00',
    endTime: '10:00',
    description: '이 이벤트는 존재하지 않습니다',
    location: '어딘가',
    category: '기타',
    repeat: { type: 'none', interval: 0 },
    notificationTime: 10,
  };

  await act(async () => {
    await result.current.saveEvent(nonExistentEvent, false);
  });

  expect(enqueueSnackbarFn).toHaveBeenCalledWith('일정 저장 실패', { variant: 'error' });
});

it("네트워크 오류 시 '일정 삭제 실패'라는 텍스트가 노출되며 이벤트 삭제가 실패해야 한다", async () => {
  server.use(
    http.delete('/api/events/:id', () => {
      return new HttpResponse(null, { status: 500 });
    })
  );

  const { result } = renderHook(() => useEventOperations(false));

  await act(() => Promise.resolve(null));

  await act(async () => {
    await result.current.deleteEvent('1');
  });

  expect(enqueueSnackbarFn).toHaveBeenCalledWith('일정 삭제 실패', { variant: 'error' });

  expect(result.current.events).toHaveLength(1);
});

describe('반복 일정 API 테스트', () => {
  it('반복 일정 생성 시 events-list API를 호출하고 여러 이벤트를 저장한다', async () => {
    setupMockHandlerBatchCreation();

    const { result } = renderHook(() => useEventOperations(false));
    await act(() => Promise.resolve(null));

    const repeatEventForm: EventForm = {
      title: '매일 운동',
      date: '2025-10-01',
      startTime: '07:00',
      endTime: '08:00',
      description: '',
      location: '헬스장',
      category: '개인',
      repeat: { type: 'daily', interval: 1, endDate: '2025-10-03' },
      notificationTime: 10,
    };

    await act(async () => {
      await result.current.saveEvent(repeatEventForm, true); // 🔑 isRepeating: true
    });

    expect(result.current.events).toHaveLength(3);
    expect(result.current.events[0].title).toBe('매일 운동');
  });

  it('단일 vs 반복 일정에 따라 올바른 API 엔드포인트를 호출한다', async () => {
    let singleApiCalled = false;
    let batchApiCalled = false;

    server.use(
      http.post('/api/events', async ({ request }) => {
        singleApiCalled = true;
        const body = (await request.json()) as Event;
        return HttpResponse.json({ ...body, id: '1' });
      }),
      http.post('/api/events-list', async ({ request }) => {
        batchApiCalled = true;
        const body = (await request.json()) as { events: EventForm[] };
        return HttpResponse.json({
          events: body.events.map((event, idx) => ({ ...event, id: String(idx + 1) })),
        });
      })
    );

    const { result } = renderHook(() => useEventOperations(false));
    await act(() => Promise.resolve(null));

    const eventData: EventForm = {
      title: '테스트',
      date: '2025-10-01',
      startTime: '10:00',
      endTime: '11:00',
      description: '',
      location: '',
      category: '업무',
      repeat: { type: 'weekly', interval: 1 },
      notificationTime: 10,
    };

    // 단일 일정 테스트
    await act(async () => {
      await result.current.saveEvent(eventData, false);
    });
    expect(singleApiCalled).toBe(true);
    expect(batchApiCalled).toBe(false);

    // 반복 일정 테스트
    singleApiCalled = false;
    await act(async () => {
      await result.current.saveEvent(eventData, true);
    });
    expect(singleApiCalled).toBe(false);
    expect(batchApiCalled).toBe(true);
  });

  it('반복 일정 수정 시 events-list PUT API를 호출한다', async () => {
    setupMockHandlerBatchUpdating();

    const { result } = renderHook(() => useEventOperations(true));
    await act(() => Promise.resolve(null));

    const updatedEvent: Event = {
      id: '1',
      title: '수정된 반복 회의',
      date: '2025-10-15',
      startTime: '09:00',
      endTime: '10:00',
      description: '수정됨',
      location: '회의실 A',
      category: '업무',
      repeat: { type: 'weekly', interval: 1 },
      notificationTime: 10,
    };

    await act(async () => {
      await result.current.saveEvent(updatedEvent, true);
    });

    expect(result.current.events[0].title).toBe('수정된 반복 회의');
    expect(enqueueSnackbarFn).toHaveBeenCalledWith('일정이 수정되었습니다.', {
      variant: 'success',
    });
  });

  it('반복 일정 저장 실패 시 에러 처리가 된다', async () => {
    server.use(
      http.post('/api/events-list', () => {
        return new HttpResponse(null, { status: 500 });
      })
    );

    const { result } = renderHook(() => useEventOperations(false));
    await act(() => Promise.resolve(null));

    const repeatEventForm: EventForm = {
      title: '실패할 반복 일정',
      date: '2025-10-01',
      startTime: '10:00',
      endTime: '11:00',
      description: '',
      location: '',
      category: '업무',
      repeat: { type: 'daily', interval: 1 },
      notificationTime: 10,
    };

    await act(async () => {
      await result.current.saveEvent(repeatEventForm, true);
    });

    expect(enqueueSnackbarFn).toHaveBeenCalledWith('일정 저장 실패', {
      variant: 'error',
    });
  });
});
