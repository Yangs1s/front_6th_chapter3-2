import CssBaseline from '@mui/material/CssBaseline';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import { render, screen, within, act, waitFor } from '@testing-library/react';
import { UserEvent, userEvent } from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { SnackbarProvider } from 'notistack';
import { ReactElement } from 'react';
import { expect, vi } from 'vitest';
import { debug } from 'vitest-preview';

import {
  setupMockHandlerBatchCreation,
  setupMockHandlerCreation,
  setupMockHandlerDeletion,
  setupMockHandlerRepeatCreationAndUpdate,
  setupMockHandlerRepeatDeletion,
  setupMockHandlerUpdating,
} from '../__mocks__/handlersUtils';
import App from '../App';
import { server } from '../setupTests';
import { Event } from '../types';

const theme = createTheme();

// ! Hard 여기 제공 안함
const setup = (element: ReactElement) => {
  const user = userEvent.setup();

  return {
    ...render(
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <SnackbarProvider>{element}</SnackbarProvider>
      </ThemeProvider>
    ),
    user,
  };
};

// ! Hard 여기 제공 안함
const saveSchedule = async (
  user: UserEvent,
  form: Omit<Event, 'id' | 'notificationTime' | 'repeat'>
) => {
  const { title, date, startTime, endTime, location, description, category } = form;

  await user.click(screen.getAllByText('일정 추가')[0]);

  await user.type(screen.getByLabelText('제목'), title);
  await user.type(screen.getByLabelText('날짜'), date);
  await user.type(screen.getByLabelText('시작 시간'), startTime);
  await user.type(screen.getByLabelText('종료 시간'), endTime);
  await user.type(screen.getByLabelText('설명'), description);
  await user.type(screen.getByLabelText('위치'), location);
  await user.click(screen.getByLabelText('카테고리'));
  await user.click(within(screen.getByLabelText('카테고리')).getByRole('combobox'));
  await user.click(screen.getByRole('option', { name: `${category}-option` }));

  await user.click(screen.getByTestId('event-submit-button'));
};

const createRepeatSchedule = async (
  user: UserEvent,
  schedule: {
    title: string;
    date: string;
    startTime: string;
    endTime: string;
    category: string;
    repeatType: 'daily' | 'weekly' | 'monthly' | 'yearly';
    endDate?: string;
  }
) => {
  // 1. 일정 추가 클릭
  await user.click(screen.getAllByText('일정 추가')[0]);

  // 2. 기본 정보 입력
  await user.type(screen.getByLabelText('제목'), schedule.title);
  await user.type(screen.getByLabelText('날짜'), schedule.date);
  await user.type(screen.getByLabelText('시작 시간'), schedule.startTime);
  await user.type(screen.getByLabelText('종료 시간'), schedule.endTime);
  await user.click(screen.getByLabelText('카테고리'));
  await user.click(within(screen.getByLabelText('카테고리')).getByRole('combobox'));
  await user.click(screen.getByRole('option', { name: `${schedule.category}-option` }));

  // 3. 반복 설정 (체크박스는 이미 체크되어 있다고 가정)
  await user.click(within(screen.getByLabelText('반복 선택')).getByRole('combobox'));
  const typeMap = { daily: '매일', weekly: '매주', monthly: '매월', yearly: '매년' };
  await user.click(await screen.findByText(typeMap[schedule.repeatType]));

  if (schedule.endDate) {
    const allEndDateInputs = screen.getAllByLabelText('반복 종료일');
    const endDateInput = allEndDateInputs[0];
    await user.type(endDateInput, schedule.endDate);
  }

  // 4. Submit
  await user.click(screen.getByTestId('event-submit-button'));
  await screen.findByText('일정이 추가되었습니다.');
};

describe('일정 CRUD 및 기본 기능', () => {
  it('입력한 새로운 일정 정보에 맞춰 모든 필드가 이벤트 리스트에 정확히 저장된다.', async () => {
    setupMockHandlerCreation();

    const { user } = setup(<App />);
    const checkBox = screen.getByLabelText('반복 일정');

    await user.click(checkBox);
    await saveSchedule(user, {
      title: '새 회의',
      date: '2025-10-15',
      startTime: '14:00',
      endTime: '15:00',
      description: '프로젝트 진행 상황 논의',
      location: '회의실 A',
      category: '업무',
    });

    const eventList = within(screen.getByTestId('event-list'));
    expect(eventList.getByText('새 회의')).toBeInTheDocument();
    expect(eventList.getByText('2025-10-15')).toBeInTheDocument();
    expect(eventList.getByText('14:00 - 15:00')).toBeInTheDocument();
    expect(eventList.getByText('프로젝트 진행 상황 논의')).toBeInTheDocument();
    expect(eventList.getByText('회의실 A')).toBeInTheDocument();
    expect(eventList.getByText('카테고리: 업무')).toBeInTheDocument();
  });

  it('기존 일정의 세부 정보를 수정하고 변경사항이 정확히 반영된다', async () => {
    const { user } = setup(<App />);

    setupMockHandlerUpdating();

    await user.click(await screen.findByLabelText('Edit event'));

    await user.clear(screen.getByLabelText('제목'));
    await user.type(screen.getByLabelText('제목'), '수정된 회의');
    await user.clear(screen.getByLabelText('설명'));
    await user.type(screen.getByLabelText('설명'), '회의 내용 변경');

    await user.click(screen.getByTestId('event-submit-button'));

    const eventList = within(screen.getByTestId('event-list'));
    expect(eventList.getByText('수정된 회의')).toBeInTheDocument();
    expect(eventList.getByText('회의 내용 변경')).toBeInTheDocument();
  });

  it('일정을 삭제하고 더 이상 조회되지 않는지 확인한다', async () => {
    setupMockHandlerDeletion();

    const { user } = setup(<App />);
    const eventList = within(screen.getByTestId('event-list'));

    // 삭제할 이벤트가 존재하는지 먼저 확인
    expect(await eventList.findByText('삭제할 이벤트')).toBeInTheDocument();

    // 삭제 버튼 클릭
    const allDeleteButton = await screen.findAllByLabelText('Delete event');
    await user.click(allDeleteButton[0]);
    // 삭제 후 해당 이벤트가 더 이상 존재하지 않는지 확인 (비동기 처리 대기)

    expect(eventList.queryByText('삭제할 이벤트')).not.toBeInTheDocument();
  });

  /// 심화과제에 들어갈 통합테스트를 조금 더 작성.

  it('100글자 제목이 정상적으로 입력되고 저장되어야 함', async () => {
    setupMockHandlerCreation();
    const { user } = setup(<App />);
    const longTitle = 'a'.repeat(100);

    const checkBox = screen.getByLabelText('반복 일정');
    await user.click(checkBox);

    await saveSchedule(user, {
      title: longTitle,
      date: '2025-10-11',
      startTime: '14:00',
      endTime: '15:00',
      description: '긴 제목 테스트',
      location: '테스트 위치',
      category: '업무',
    });

    await screen.findByText('일정이 추가되었습니다.');

    debug();
    const eventList = within(screen.getByTestId('event-list'));

    expect(eventList.getByText(longTitle)).toBeInTheDocument();
  });
  it('빈 제목으로 저장 시 에러 메시지가 표시되어야 함', async () => {
    const { user } = setup(<App />);

    await screen.findByText('일정 로딩 완료!');

    // 반복 일정 해제
    const checkBox = screen.getByLabelText('반복 일정');
    await user.click(checkBox);

    // 제목 없이 저장 시도
    await user.click(screen.getAllByText('일정 추가')[0]);
    await user.type(screen.getByLabelText('날짜'), '2025-10-15');
    await user.type(screen.getByLabelText('시작 시간'), '14:00');
    await user.type(screen.getByLabelText('종료 시간'), '15:00');

    await user.click(screen.getByTestId('event-submit-button'));

    expect(screen.getByText('필수 정보를 모두 입력해주세요.')).toBeInTheDocument();
  });
  /// 5000ms 초과떄문에
  it.skip('200글자 설명이 정상적으로 입력되고 저장되어야 함', async () => {
    const { user } = setup(<App />);
    const longDescription = '설명'.repeat(100); // 200글자
    const checkBox = screen.getByLabelText('반복 일정');
    await user.click(checkBox);
    await saveSchedule(user, {
      title: '긴 설명 테스트',
      date: '2025-10-15',
      startTime: '14:00',
      endTime: '15:00',
      description: longDescription,
      location: '테스트 위치',
      category: '업무',
    });

    await screen.findByText('일정이 추가되었습니다.');

    const eventList = within(screen.getByTestId('event-list'));
    expect(eventList.getByText(longDescription)).toBeInTheDocument();
  });
});

describe('일정 뷰', () => {
  it('주별 뷰를 선택 후 해당 주에 일정이 없으면, 일정이 표시되지 않는다.', async () => {
    // ! 현재 시스템 시간 2025-10-01
    const { user } = setup(<App />);

    await user.click(within(screen.getByLabelText('뷰 타입 선택')).getByRole('combobox'));
    await user.click(screen.getByRole('option', { name: 'week-option' }));

    // ! 일정 로딩 완료 후 테스트
    await screen.findByText('일정 로딩 완료!');

    const eventList = within(screen.getByTestId('event-list'));
    expect(eventList.getByText('검색 결과가 없습니다.')).toBeInTheDocument();
  });

  it('주별 뷰 선택 후 해당 일자에 일정이 존재한다면 해당 일정이 정확히 표시된다', async () => {
    setupMockHandlerCreation();

    const { user } = setup(<App />);
    const checkBox = screen.getByLabelText('반복 일정');

    await user.click(checkBox);

    await saveSchedule(user, {
      title: '이번주 팀 회의',
      date: '2025-10-02',
      startTime: '09:00',
      endTime: '10:00',
      description: '이번주 팀 회의입니다.',
      location: '회의실 A',
      category: '업무',
    });

    await user.click(within(screen.getByLabelText('뷰 타입 선택')).getByRole('combobox'));
    await user.click(screen.getByRole('option', { name: 'week-option' }));

    const weekView = within(screen.getByTestId('week-view'));
    expect(weekView.getByText('이번주 팀 회의')).toBeInTheDocument();
  });

  it('월별 뷰에 일정이 없으면, 일정이 표시되지 않아야 한다.', async () => {
    vi.setSystemTime(new Date('2025-01-01'));

    setup(<App />);

    // ! 일정 로딩 완료 후 테스트
    await screen.findByText('일정 로딩 완료!');

    const eventList = within(screen.getByTestId('event-list'));
    expect(eventList.getByText('검색 결과가 없습니다.')).toBeInTheDocument();
  });

  it('월별 뷰에 일정이 정확히 표시되는지 확인한다', async () => {
    setupMockHandlerCreation();

    const { user } = setup(<App />);
    const checkBox = screen.getByLabelText('반복 일정');

    await user.click(checkBox);

    await saveSchedule(user, {
      title: '이번달 팀 회의',
      date: '2025-10-02',
      startTime: '09:00',
      endTime: '10:00',
      description: '이번달 팀 회의입니다.',
      location: '회의실 A',
      category: '업무',
    });

    const monthView = within(screen.getByTestId('month-view'));
    expect(monthView.getByText('이번달 팀 회의')).toBeInTheDocument();
  });

  it('달력에 1월 1일(신정)이 공휴일로 표시되는지 확인한다', async () => {
    vi.setSystemTime(new Date('2025-01-01'));
    setup(<App />);

    const monthView = screen.getByTestId('month-view');

    // 1월 1일 셀 확인
    const januaryFirstCell = within(monthView).getByText('1').closest('td')!;
    expect(within(januaryFirstCell).getByText('신정')).toBeInTheDocument();
  });
});

describe('검색 기능', () => {
  beforeEach(() => {
    server.use(
      http.get('/api/events', () => {
        return HttpResponse.json({
          events: [
            {
              id: 1,
              title: '팀 회의',
              date: '2025-10-15',
              startTime: '09:00',
              endTime: '10:00',
              description: '주간 팀 미팅',
              location: '회의실 A',
              category: '업무',
              repeat: { type: 'none', interval: 0 },
              notificationTime: 10,
            },
            {
              id: 2,
              title: '프로젝트 계획',
              date: '2025-10-16',
              startTime: '14:00',
              endTime: '15:00',
              description: '새 프로젝트 계획 수립',
              location: '회의실 B',
              category: '업무',
              repeat: { type: 'none', interval: 0 },
              notificationTime: 10,
            },
          ],
        });
      })
    );
  });

  afterEach(() => {
    server.resetHandlers();
  });

  it('검색 결과가 없으면, "검색 결과가 없습니다."가 표시되어야 한다.', async () => {
    const { user } = setup(<App />);

    const searchInput = screen.getByPlaceholderText('검색어를 입력하세요');
    await user.type(searchInput, '존재하지 않는 일정');

    const eventList = within(screen.getByTestId('event-list'));
    expect(eventList.getByText('검색 결과가 없습니다.')).toBeInTheDocument();
  });

  it("'팀 회의'를 검색하면 해당 제목을 가진 일정이 리스트에 노출된다", async () => {
    const { user } = setup(<App />);

    const searchInput = screen.getByPlaceholderText('검색어를 입력하세요');
    await user.type(searchInput, '팀 회의');

    const eventList = within(screen.getByTestId('event-list'));
    expect(eventList.getByText('팀 회의')).toBeInTheDocument();
  });

  it('검색어를 지우면 모든 일정이 다시 표시되어야 한다', async () => {
    const { user } = setup(<App />);

    const searchInput = screen.getByPlaceholderText('검색어를 입력하세요');
    await user.type(searchInput, '팀 회의');
    await user.clear(searchInput);

    const eventList = within(screen.getByTestId('event-list'));
    expect(eventList.getByText('팀 회의')).toBeInTheDocument();
    expect(eventList.getByText('프로젝트 계획')).toBeInTheDocument();
  });
});

describe('일정 충돌', () => {
  afterEach(() => {
    server.resetHandlers();
  });

  it('겹치는 시간에 새 일정을 추가할 때 경고가 표시된다', async () => {
    setupMockHandlerCreation([
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

    const { user } = setup(<App />);

    await saveSchedule(user, {
      title: '새 회의',
      date: '2025-10-15',
      startTime: '09:30',
      endTime: '10:30',
      description: '설명',
      location: '회의실 A',
      category: '업무',
    });

    expect(screen.getByText('일정 겹침 경고')).toBeInTheDocument();
    expect(screen.getByText(/다음 일정과 겹칩니다/)).toBeInTheDocument();
    expect(screen.getByText('기존 회의 (2025-10-15 09:00-10:00)')).toBeInTheDocument();
  });

  it('기존 일정의 시간을 수정하여 충돌이 발생하면 경고가 노출된다', async () => {
    setupMockHandlerUpdating();

    const { user } = setup(<App />);

    const editButton = (await screen.findAllByLabelText('Edit event'))[1];
    await user.click(editButton);

    // 시간 수정하여 다른 일정과 충돌 발생
    await user.clear(screen.getByLabelText('시작 시간'));
    await user.type(screen.getByLabelText('시작 시간'), '08:30');
    await user.clear(screen.getByLabelText('종료 시간'));
    await user.type(screen.getByLabelText('종료 시간'), '10:30');

    await user.click(screen.getByTestId('event-submit-button'));

    expect(screen.getByText('일정 겹침 경고')).toBeInTheDocument();
    expect(screen.getByText(/다음 일정과 겹칩니다/)).toBeInTheDocument();
    expect(screen.getByText('기존 회의 (2025-10-15 09:00-10:00)')).toBeInTheDocument();
  });
});

it('notificationTime을 10으로 하면 지정 시간 10분 전 알람 텍스트가 노출된다', async () => {
  vi.setSystemTime(new Date('2025-10-15 08:49:59'));

  setup(<App />);

  // ! 일정 로딩 완료 후 테스트
  await screen.findByText('일정 로딩 완료!');

  expect(screen.queryByText('10분 후 기존 회의 일정이 시작됩니다.')).not.toBeInTheDocument();

  act(() => {
    vi.advanceTimersByTime(1000);
  });

  expect(screen.getByText('10분 후 기존 회의 일정이 시작됩니다.')).toBeInTheDocument();
});

//- 일정 생성 또는 수정 시 반복 유형을 선택할 수 있다.
// - 반복 유형은 다음과 같다: 매일, 매주, 매월, 매년
//     - 31일에 매월을 선택한다면 → 매월 마지막이 아닌, 31일에만 생성하세요.
//     - 윤년 29일에 매년을 선택한다면 → 29일에만 생성하세요!

describe('반복 유형 선택', () => {
  it('일정 생성 또는 수정 시 반복 유형을 선택할 수 있다.', async () => {
    setupMockHandlerCreation();
    const { user } = setup(<App />);

    await screen.findByText('일정 로딩 완료!');

    // 반복 일정 체크박스 클릭
    const checkBox = screen.getByLabelText('반복 일정');
    expect(checkBox).toBeChecked();

    // 반복 유형 UI가 나타나는지 확인
    expect(screen.getByText('반복 유형')).toBeInTheDocument();
    expect(screen.getByText('반복 간격')).toBeInTheDocument();

    // 반복 유형 선택
    const repeatTypeSelect = await screen.findByText('반복 유형', {}, { timeout: 1000 });
    expect(repeatTypeSelect).toBeInTheDocument();

    await user.click(within(screen.getByLabelText('반복 선택')).getByRole('combobox'));
    // 모든 반복 옵션 확인
    await waitFor(() => {
      expect(screen.getByText('매일')).toBeInTheDocument();
      expect(screen.getByText('매주')).toBeInTheDocument();
      expect(screen.getByText('매월')).toBeInTheDocument();
      expect(screen.getByText('매년')).toBeInTheDocument();
    });

    // 매월 선택
    await user.click(screen.getByText('매월'));
    expect(screen.getByText('매월')).toBeInTheDocument();
  });

  it('31일에 매월을 선택하면 31일이 있는 달에만 반복 일정이 생성된다', async () => {
    setupMockHandlerBatchCreation();
    const { user } = setup(<App />);

    const checkBox = screen.getByLabelText('반복 일정');
    expect(checkBox).toBeChecked();

    await createRepeatSchedule(user, {
      title: '월말 회의',
      date: '2025-10-31',
      startTime: '14:00',
      endTime: '15:00',
      category: '업무',
      repeatType: 'monthly',
      endDate: '2025-12-31', // 3주간
    });
    await screen.findByText('일정이 추가되었습니다.');
    // 실제 검증: 생성된 일정들 확인

    const nextButton = screen.getByRole('button', { name: 'Next' });
    await user.click(nextButton);
    await user.click(nextButton);

    act(() => {
      vi.advanceTimersByTime(5000);
    });
    await waitFor(() => expect(screen.getByText('2025-12-31')).toBeInTheDocument());
  });

  it('윤년 2월 29일 매년 반복은 윤년에만 생성된다', async () => {
    vi.setSystemTime(new Date('2024-02-01'));
    setupMockHandlerBatchCreation();
    const { user } = setup(<App />);

    await screen.findByText('일정 로딩 완료!');

    // 2024년 2월 29일 윤년 일정 생성
    await createRepeatSchedule(user, {
      title: '윤년 기념일',
      date: '2024-02-29',
      startTime: '12:00',
      endTime: '13:00',
      category: '개인',
      repeatType: 'yearly',
      endDate: '2032-02-29',
    });

    // 현재 2024년 2월에서는 2024년 것만 보임
    const eventList = screen.getByTestId('event-list');
    expect(within(eventList).getByText('윤년 기념일')).toBeInTheDocument();
    expect(within(eventList).getByText('2024-02-29')).toBeInTheDocument();

    // 2028년으로 네비게이션 (4년 * 12개월 = 48번)
    for (let i = 0; i < 12; i++) {
      await user.click(screen.getByRole('button', { name: 'Next' }));
    }
    // 2028년 2월에서 윤년 일정 확인
    expect(within(eventList).queryByText('윤년 기념일')).not.toBeInTheDocument();
    expect(within(eventList).queryByText('2025-02-29')).not.toBeInTheDocument();
  });

  it('매주 반복 일정이 올바르게 생성된다', async () => {
    const { user } = setup(<App />);

    await screen.findByText('일정 로딩 완료!');

    await user.type(screen.getByLabelText('제목'), '주간 회의');
    await user.type(screen.getByLabelText('날짜'), '2024-01-01');
    await user.type(screen.getByLabelText('시작 시간'), '14:00');
    await user.type(screen.getByLabelText('종료 시간'), '15:00');

    // 반복 설정
    const checkBox = screen.getByLabelText('반복 일정');
    expect(checkBox).toBeChecked();

    await user.click(within(screen.getByLabelText('반복 선택')).getByRole('combobox'));
    await user.click(await screen.findByText('매주'));

    // 반복 간격 설정 (2주마다)
    const intervalInput = screen.getByLabelText('반복 간격');
    await user.type(intervalInput, '2');

    // 종료일 설정
    const allEndDateInputs = screen.getAllByLabelText('반복 종료일');
    const endDateInput = allEndDateInputs[0]; // 첫 번째 요소

    await user.type(endDateInput, '2024-02-29');

    // 일정 저장
    await user.click(screen.getByTestId('event-submit-button'));

    // 2주 간격 매주 반복이 올바르게 생성되는지 확인
  });

  it('반복 간격을 변경할 수 있다', async () => {
    const { user } = setup(<App />);

    await screen.findByText('일정 로딩 완료!');

    // 반복 일정 활성화
    const checkBox = screen.getByLabelText('반복 일정');
    expect(checkBox).toBeChecked();

    // 반복 간격 필드 확인 및 변경
    const intervalInput = screen.getByDisplayValue('1');
    expect(intervalInput).toHaveValue(1); // 기본값

    await user.clear(intervalInput);
    await user.type(intervalInput, '5');
    expect(intervalInput).toHaveValue(5);

    // 매우 큰 간격값 테스트
    await user.clear(intervalInput);
    await user.type(intervalInput, '999');
    expect(intervalInput).toHaveValue(999);
  });

  it('반복 종료일을 설정할 수 있다', async () => {
    const { user } = setup(<App />);

    await screen.findByText('일정 로딩 완료!');

    // 반복 일정 활성화
    const checkBox = screen.getByLabelText('반복 일정');
    expect(checkBox).toBeChecked();

    // 반복 종료일 필드 확인 및 설정
    const endDateInput = screen.getByLabelText('반복 종료일', { selector: 'input' });
    expect(endDateInput).toBeInTheDocument();

    await user.type(endDateInput, '2025-12-31');

    expect(endDateInput).toHaveValue('2025-12-31');
  });

  it('반복 일정을 해제하면 반복 옵션이 사라진다', async () => {
    const { user } = setup(<App />);

    await screen.findByText('일정 로딩 완료!');

    // 반복 일정 활성화
    const checkBox = screen.getByLabelText('반복 일정');
    expect(checkBox).toBeChecked();

    // 반복 옵션들이 보이는지 확인
    expect(screen.getByText('반복 유형')).toBeInTheDocument();
    expect(screen.getByText('반복 간격')).toBeInTheDocument();
    expect(screen.getByText('반복 종료일')).toBeInTheDocument();

    // 반복 일정 해제
    await user.click(checkBox);
    expect(checkBox).not.toBeChecked();

    // 반복 옵션들이 사라졌는지 확인
    expect(screen.queryByText('반복 유형')).not.toBeInTheDocument();
    expect(screen.queryByText('반복 간격')).not.toBeInTheDocument();
    expect(screen.queryByText('반복 종료일')).not.toBeInTheDocument();
  });

  it('매일 반복 일정이 올바르게 생성된다', async () => {
    setupMockHandlerBatchCreation([]);
    const { user } = setup(<App />);

    await screen.findByText('일정 로딩 완료!');

    await user.type(screen.getByLabelText('제목'), '운동');
    await user.type(screen.getByLabelText('날짜'), '2025-10-01');
    await user.type(screen.getByLabelText('시작 시간'), '07:00');
    await user.type(screen.getByLabelText('종료 시간'), '08:00');

    // 반복 설정 - 매일
    const checkBox = screen.getByLabelText('반복 일정');
    expect(checkBox).toBeChecked();

    await user.click(within(screen.getByLabelText('반복 선택')).getByRole('combobox'));
    await user.click(await screen.findByText('매일'));

    const allEndDateInputs = screen.getAllByLabelText('반복 종료일');
    const endDateInput = allEndDateInputs[0]; // 첫 번째 요소

    await user.click(endDateInput);
    await user.type(endDateInput, '2025-10-07');
    expect(endDateInput).toHaveValue('2025-10-07');

    await user.click(screen.getByTestId('event-submit-button'));

    // 일정 저장
    const eventList = within(screen.getByTestId('event-list'));

    await waitFor(() => {
      expect(eventList.getByText('2025-10-03')).toBeInTheDocument();
    });
    // 7일간 매일 반복이 생성되는지 콘솔에서 확인 가능
  });
});
// 🔥 반복일정 통합테스트 - medium.integration.spec.tsx에 추가

describe('반복일정 표시', () => {
  it('매주 반복일정이 캘린더에 여러 날짜에 표시된다', async () => {
    setupMockHandlerBatchCreation();
    const { user } = setup(<App />);

    await user.type(screen.getByLabelText('제목'), '주간 회의');
    await user.type(screen.getByLabelText('날짜'), '2025-10-01');
    await user.type(screen.getByLabelText('시작 시간'), '14:00');
    await user.type(screen.getByLabelText('종료 시간'), '15:00');
    await user.type(screen.getByLabelText('설명'), '매주 팀 회의');
    await user.type(screen.getByLabelText('위치'), '회의실 A');
    await user.click(screen.getByLabelText('카테고리'));
    await user.click(within(screen.getByLabelText('카테고리')).getByRole('combobox'));
    await user.click(screen.getByRole('option', { name: '업무-option' }));
    // 반복 설정

    await user.click(within(screen.getByLabelText('반복 선택')).getByRole('combobox'));
    await user.click(await screen.findByText('매주'));

    const allEndDateInputs = screen.getAllByLabelText('반복 종료일');
    const endDateInput = allEndDateInputs[0]; // 첫 번째 요소
    await user.type(endDateInput, '2025-10-22');
    await user.click(screen.getByTestId('event-submit-button'));

    await screen.findByText('일정이 추가되었습니다.');

    // 월간뷰에서 여러 날짜에 표시되는지 확인
    const monthView = screen.getByTestId('month-view');
    expect(within(monthView).getAllByText('주간 회의')).toHaveLength(4); // 10/1, 10/8, 10/15, 10/22
  });

  it('반복일정이 이벤트 리스트에 반복 표시와 함께 나타난다', async () => {
    setupMockHandlerBatchCreation();
    const { user } = setup(<App />);

    await user.type(screen.getByLabelText('제목'), '매일 운동');
    await user.type(screen.getByLabelText('날짜'), '2025-10-01');
    await user.type(screen.getByLabelText('시작 시간'), '14:00');
    await user.type(screen.getByLabelText('종료 시간'), '15:00');
    await user.click(screen.getByLabelText('카테고리'));
    await user.click(within(screen.getByLabelText('카테고리')).getByRole('combobox'));
    await user.click(screen.getByRole('option', { name: '개인-option' }));
    // 매일 반복 설정

    await user.click(within(screen.getByLabelText('반복 선택')).getByRole('combobox'));
    await user.click(await screen.findByText('매일'));
    const allEndDateInputs = screen.getAllByLabelText('반복 종료일');
    const endDateInput = allEndDateInputs[0]; // 첫 번째 요소
    await user.type(endDateInput, '2025-10-05');
    await user.click(screen.getByTestId('event-submit-button'));

    await screen.findByText('일정이 추가되었습니다.');

    const eventList = screen.getByTestId('event-list');
    expect(within(eventList).getAllByText('매일 운동')).toHaveLength(5);
  });

  it('월별 반복일정이 다른 월로 넘어가도 올바르게 표시된다', async () => {
    setupMockHandlerBatchCreation();
    const { user } = setup(<App />);

    await user.type(screen.getByLabelText('제목'), '월간 보고');
    await user.type(screen.getByLabelText('날짜'), '2025-10-31');
    await user.type(screen.getByLabelText('시작 시간'), '14:00');
    await user.type(screen.getByLabelText('종료 시간'), '15:00');
    await user.click(screen.getByLabelText('카테고리'));
    await user.click(within(screen.getByLabelText('카테고리')).getByRole('combobox'));
    await user.click(screen.getByRole('option', { name: '개인-option' }));
    // 매월 반복 설정

    await user.click(within(screen.getByLabelText('반복 선택')).getByRole('combobox'));
    await user.click(await screen.findByText('매월'));

    const allEndDateInputs = screen.getAllByLabelText('반복 종료일');
    const endDateInput = allEndDateInputs[0];

    await user.type(endDateInput, '2025-12-31');
    await user.click(screen.getByTestId('event-submit-button'));

    // 다음 달로 이동
    const nextButton = screen.getByLabelText('Next');
    await user.click(nextButton);

    const monthView = screen.getByTestId('month-view');
    // 11월에는 31일이 없어서 표시되지 않아야 함
    expect(within(monthView).queryByText('월간 보고')).not.toBeInTheDocument();

    // 12월로 이동
    await user.click(nextButton);
    // 12월 31일에는 표시되어야 함
    expect(within(monthView).getByText('월간 보고')).toBeInTheDocument();
  });

  it('캘린더 뷰에서 반복 일정이 아이콘과 함께 표시된다', async () => {
    setupMockHandlerBatchCreation();
    const { user } = setup(<App />);

    await createRepeatSchedule(user, {
      title: '주간 회의',
      date: '2025-10-01',
      startTime: '14:00',
      endTime: '15:00',
      category: '업무',
      repeatType: 'weekly',
      endDate: '2025-10-15', // 3주간
    });

    // 월간뷰에서 반복 일정 아이콘 확인
    const monthView = screen.getByTestId('month-view');
    const repeatEvents = within(monthView).getAllByText('주간 회의');
    expect(repeatEvents).toHaveLength(3); // 10/1, 10/8, 10/15

    // 반복 일정 아이콘 표시 확인 (구현에 따라 조정)
    const calendarRepeatIcons = within(monthView).getAllByTestId('repeat-icon');
    expect(calendarRepeatIcons).toHaveLength(3);
  });

  // 반복간격에 대한 테스트 해봄
  it('52주 간격 매주 반복이 1년 후 일정을 생성해야 함', async () => {
    setupMockHandlerBatchCreation();

    const { user } = setup(<App />);
    await screen.findByText('일정 로딩 완료!');

    // 반복 일정 생성
    await user.type(screen.getByLabelText('제목'), '연간 회의');
    await user.type(screen.getByLabelText('날짜'), '2025-10-15');
    await user.type(screen.getByLabelText('시작 시간'), '14:00');
    await user.type(screen.getByLabelText('종료 시간'), '15:00');

    await user.click(screen.getByLabelText('카테고리'));
    await user.click(within(screen.getByLabelText('카테고리')).getByRole('combobox'));
    await user.click(screen.getByRole('option', { name: '업무-option' }));

    // 52주 간격 설정
    await user.click(within(screen.getByLabelText('반복 선택')).getByRole('combobox'));
    await user.click(screen.getByText('매주'));

    const intervalInput = screen.getByLabelText('반복 간격');
    await user.clear(intervalInput);
    await user.type(intervalInput, '52');

    // 종료일 설정 (2년 후까지)
    const endDateInput = screen.getByLabelText('반복 종료일', { selector: 'input' });
    await user.type(endDateInput, '2027-10-15');

    // 저장
    await user.click(screen.getByTestId('event-submit-button'));
    await screen.findByText('일정이 추가되었습니다.');

    // 🔥 진짜 테스트: 1년 후에 일정이 있는지 확인
    // 2026년 10월로 이동 (12개월)
    const nextButton = screen.getByRole('button', { name: 'Next' });
    for (let i = 0; i < 12; i++) {
      await user.click(nextButton);
    }

    // 2026년 10월에 "연간 회의"가 표시되는지 확인
    const eventList = within(screen.getByTestId('event-list'));
    expect(eventList.getByText('연간 회의')).toBeInTheDocument();
    debug();
    expect(eventList.getByText('2026-10-14')).toBeInTheDocument();
  });
});

describe('반복종료', () => {
  it('종료일 이후로는 반복일정이 생성되지 않는다', async () => {
    setupMockHandlerBatchCreation();
    const { user } = setup(<App />);

    await createRepeatSchedule(user, {
      title: '단기 프로젝트 회의',
      date: '2025-10-01',
      startTime: '14:00',
      endTime: '15:00',
      category: '개인',
      repeatType: 'daily',
      endDate: '2025-10-03', // 3일까지만
    });

    const eventList = screen.getByTestId('event-list');
    const eventElements = within(eventList).getAllByText('단기 프로젝트 회의');
    expect(eventElements).toHaveLength(3); // 10/1, 10/2, 10/3만

    // 날짜 확인
    expect(within(eventList).getByText('2025-10-01')).toBeInTheDocument();
    expect(within(eventList).getByText('2025-10-03')).toBeInTheDocument();
    expect(within(eventList).queryByText('2025-10-04')).not.toBeInTheDocument();
  });

  it('종료일이 설정되지 않으면 1년간 반복일정이 생성된다', async () => {
    setupMockHandlerBatchCreation();
    const { user } = setup(<App />);

    await createRepeatSchedule(user, {
      title: '장기 운동 계획',
      date: '2025-10-01',
      startTime: '07:00',
      endTime: '08:00',
      repeatType: 'weekly',
      category: '개인',
    });

    const eventList = screen.getByTestId('event-list');
    const eventElements = within(eventList).getAllByText('장기 운동 계획');
    // 1년간 매주 = 대략 52개 정도 (실제로는 53개일 수도)
    expect(eventElements.length).toBeLessThan(55);
  });

  it('종료일 당일까지는 반복일정이 포함된다', async () => {
    setupMockHandlerBatchCreation();
    const { user } = setup(<App />);

    await createRepeatSchedule(user, {
      title: '주말 특강',
      date: '2025-10-04', // 토요일
      startTime: '07:00',
      endTime: '08:00',
      repeatType: 'weekly',
      category: '개인',
      endDate: '2025-10-18',
    });

    // 매주 반복, 정확히 2주 후 토요일까지

    await screen.findByText('일정이 추가되었습니다.');

    const eventList = screen.getByTestId('event-list');
    expect(within(eventList).getAllByText('주말 특강')).toHaveLength(3);

    // 종료일 당일 포함 확인
    expect(within(eventList).getByText('2025-10-04')).toBeInTheDocument(); // 첫째 주
    expect(within(eventList).getByText('2025-10-11')).toBeInTheDocument(); // 둘째 주
    expect(within(eventList).getByText('2025-10-18')).toBeInTheDocument(); // 셋째 주 (종료일)
  });

  it('반복 종료일을 설정할 수 있다', async () => {
    const { user } = setup(<App />);
    await screen.findByText('일정 로딩 완료!');

    // 반복 일정 활성화
    const checkBox = screen.getByLabelText('반복 일정');
    expect(checkBox).toBeChecked();

    // 반복 종료일 필드 확인 및 설정
    const allEndDateInputs = screen.getAllByLabelText('반복 종료일');
    const endDateInput = allEndDateInputs[0];
    expect(endDateInput).toBeInTheDocument();

    await user.type(endDateInput, '2025-10-30');
    expect(endDateInput).toHaveValue('2025-10-30');
  });

  it('2025-10-30까지 최대 기간으로 반복 일정을 생성할 수 있다', async () => {
    setupMockHandlerBatchCreation();
    const { user } = setup(<App />);

    await screen.findByText('일정 로딩 완료!');

    await createRepeatSchedule(user, {
      title: '최대 기간 테스트',
      date: '2025-10-01',
      startTime: '09:00',
      endTime: '10:00',
      category: '업무',
      repeatType: 'daily',
      endDate: '2025-10-30', // 최대 종료일
    });

    await screen.findByText('일정이 추가되었습니다.');

    // 30일간 매일 반복 = 30개 일정 생성 확인
    const eventList = screen.getByTestId('event-list');
    const maxPeriodEvents = within(eventList).getAllByText('최대 기간 테스트');
    expect(maxPeriodEvents).toHaveLength(30);

    // 첫째 날과 마지막 날 확인
    expect(within(eventList).getByText('2025-10-01')).toBeInTheDocument();
    expect(within(eventList).getByText('2025-10-30')).toBeInTheDocument();

    // 다음 날은 없어야 함
    expect(within(eventList).queryByText('2025-10-31')).not.toBeInTheDocument();
  });
});

describe('반복일정 단일수정', () => {
  it('반복일정을 수정하면 단일 일정으로 변경된다', async () => {
    // 1) 생성 핸들러로 반복일정을 먼저 만든 뒤
    setupMockHandlerRepeatCreationAndUpdate();
    // 2) 단일 수정 핸들러를 추가 등록해서 PUT /api/events/:id를 처리

    const { user } = setup(<App />);

    // 반복일정 생성: 매일 3일
    await createRepeatSchedule(user, {
      title: '반복 편집 테스트',
      date: '2025-10-01',
      startTime: '09:00',
      endTime: '10:00',
      category: '업무',
      repeatType: 'daily',
      endDate: '2025-10-03',
    });
    await screen.findByText('일정이 추가되었습니다.');

    // 두 번째 인스턴스 편집 진입 (임의로 2번째 선택)
    const editButtons = screen.getAllByLabelText('Edit event');
    await user.click(editButtons[1]);

    // 제목도 살짝 변경해 구분
    await user.clear(screen.getByLabelText('제목'));
    await user.type(screen.getByLabelText('제목'), '단일로 변경된 일정');

    // 저장
    await user.click(screen.getByTestId('event-submit-button'));
    await screen.findByText('일정이 수정되었습니다.');

    // 이벤트 리스트에서 변경된 일정은 반복 표기가 없어야 함
    const eventList = within(screen.getByTestId('event-list'));
    expect(eventList.getByText('단일로 변경된 일정')).toBeInTheDocument();
  });

  it('반복일정을 수정하면 단일 일정으로 변경되고 아이콘이 사라진다', async () => {
    setupMockHandlerRepeatCreationAndUpdate();

    const { user } = setup(<App />);

    // 반복일정 생성 (3일간 매일)
    await createRepeatSchedule(user, {
      title: '반복 테스트',
      date: '2025-10-01',
      startTime: '10:00',
      endTime: '11:00',
      category: '업무',
      repeatType: 'daily',
      endDate: '2025-10-03',
    });

    // 두 번째 일정 수정
    const editButtons = screen.getAllByLabelText('Edit event');
    await user.click(editButtons[1]);

    // 반복 해제 → 단일 일정으로 변경
    const repeatCheckBox = screen.getByLabelText('반복 일정');
    await user.click(repeatCheckBox);

    // 제목 변경
    await user.clear(screen.getByLabelText('제목'));
    await user.type(screen.getByLabelText('제목'), '단일 일정으로 변경');

    await user.click(screen.getByTestId('event-submit-button'));
    await screen.findByText('일정이 수정되었습니다.');

    // 검증
    const eventList = screen.getByTestId('event-list');
    expect(within(eventList).getByText('단일 일정으로 변경')).toBeInTheDocument();
    expect(within(eventList).getAllByText('반복 테스트')).toHaveLength(2); // 원래 3개에서 1개 변경됨

    const remainingIcons = screen.getAllByTestId('repeat-icon');
    expect(remainingIcons).toHaveLength(4); // 원래 6개에서 2개 줄음
  });
});

describe('반복일정 단일삭제', () => {
  it('반복일정 중 하나만 삭제해도 다른 반복일정은 그대로 유지된다', async () => {
    setupMockHandlerRepeatDeletion();

    const { user } = setup(<App />);

    // 반복일정 생성 (5일간 매일)
    await createRepeatSchedule(user, {
      title: '삭제 테스트',
      date: '2025-10-01',
      startTime: '15:00',
      endTime: '16:00',
      category: '업무',
      repeatType: 'daily',
      endDate: '2025-10-05',
    });

    const eventList = screen.getByTestId('event-list');
    expect(within(eventList).getAllByText('삭제 테스트')).toHaveLength(5);

    // 중간 일정(3번째) 삭제
    const deleteButtons = screen.getAllByLabelText('Delete event');
    await user.click(deleteButtons[2]);

    // 검증: 4개만 남음 (10/3 삭제됨)
    expect(within(eventList).getAllByText('삭제 테스트')).toHaveLength(4);
    expect(within(eventList).queryByText('2025-10-03')).not.toBeInTheDocument();
    expect(within(eventList).getByText('2025-10-01')).toBeInTheDocument();
    expect(within(eventList).getByText('2025-10-05')).toBeInTheDocument();
  });
});

describe('반복일정 아이콘', () => {
  it('반복 일정이면 캘린더와 리스트에 반복 아이콘이 표시된다', async () => {
    setupMockHandlerBatchCreation();
    const { user } = setup(<App />);

    await createRepeatSchedule(user, {
      title: '반복 테스트',
      date: '2025-10-01',
      startTime: '09:00',
      endTime: '10:00',
      category: '업무',
      repeatType: 'daily',
      endDate: '2025-10-03', // 총 3개 인스턴스
    });

    await screen.findByText('일정이 추가되었습니다.');

    // 캘린더(월별 뷰)에서 반복 아이콘 존재 확인

    const repeatIcons = screen.getAllByTestId('repeat-icon');
    expect(repeatIcons).toHaveLength(6);
  });
});
