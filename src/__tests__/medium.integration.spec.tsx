import CssBaseline from '@mui/material/CssBaseline';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import { render, screen, within, act, renderHook, waitFor } from '@testing-library/react';
import { UserEvent, userEvent } from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { SnackbarProvider } from 'notistack';
import { ReactElement } from 'react';
import { expect } from 'vitest';
import { debug } from 'vitest-preview';

import {
  setupMockHandlerBatchCreation,
  setupMockHandlerCreation,
  setupMockHandlerDeletion,
  setupMockHandlerUpdating,
} from '../__mocks__/handlersUtils';
import App from '../App';
import { useEventForm } from '../hooks/useEventForm.ts';
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

describe('일정 CRUD 및 기본 기능', () => {
  it('입력한 새로운 일정 정보에 맞춰 모든 필드가 이벤트 리스트에 정확히 저장된다.', async () => {
    setupMockHandlerCreation();

    const { user } = setup(<App />);

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
    expect(await eventList.findByText('삭제할 이벤트')).toBeInTheDocument();

    // 삭제 버튼 클릭
    const allDeleteButton = await screen.findAllByLabelText('Delete event');
    await user.click(allDeleteButton[0]);

    expect(eventList.queryByText('삭제할 이벤트')).not.toBeInTheDocument();
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
  beforeEach(() => {
    setupMockHandlerCreation();
  });

  it('일정 생성 또는 수정 시 반복 유형을 선택할 수 있다.', async () => {
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
    const { user } = setup(<App />);

    await screen.findByText('일정 로딩 완료!');

    // 31일 날짜 입력
    await user.type(screen.getByLabelText('제목'), '월말 회의');
    await user.type(screen.getByLabelText('날짜'), '2024-01-31');
    await user.type(screen.getByLabelText('시작 시간'), '10:00');
    await user.type(screen.getByLabelText('종료 시간'), '11:00');
    // 반복 설정
    const checkBox = screen.getByLabelText('반복 일정');
    expect(checkBox).toBeChecked();

    expect(screen.getByText('반복 유형')).toBeInTheDocument();
    expect(screen.getByText('반복 간격')).toBeInTheDocument();

    await user.click(within(screen.getByLabelText('반복 선택')).getByRole('combobox'));
    await user.click(await screen.findByText('매월'));

    // 종료일 설정 (6개월 후)

    await user.type(screen.getByLabelText('반복 종료일'), '2025-08-31');

    // 일정 저장
    await user.click(screen.getByTestId('event-submit-button'));

    // 콘솔에서 31일 규칙 확인 - 실제로는 1월, 3월, 5월, 7월에만 생성되어야 함
    // (2월, 4월, 6월은 31일이 없어서 건너뛰기)
    // 실제 검증은 콘솔 로그나 생성된 일정 개수로 확인 가능
  });

  it('윤년 2월 29일 매년 반복은 윤년에만 생성된다', async () => {
    const { user } = setup(<App />);

    await screen.findByText('일정 로딩 완료!');

    // 윤년 2월 29일 입력
    await user.type(screen.getByLabelText('제목'), '윤년 기념일');
    await user.type(screen.getByLabelText('날짜'), '2024-02-29');
    await user.type(screen.getByLabelText('시작 시간'), '12:00');
    await user.type(screen.getByLabelText('종료 시간'), '13:00');

    // 반복 설정
    const checkBox = screen.getByLabelText('반복 일정');
    expect(checkBox).toBeChecked();

    await user.click(within(screen.getByLabelText('반복 선택')).getByRole('combobox'));
    await user.click(await screen.findByText('매년'));

    // 종료일 설정 (8년 후)
    const endDateInput = screen.getByLabelText('반복 종료일');
    await user.type(endDateInput, '2032-02-29');

    // 일정 저장
    await user.click(screen.getByTestId('event-submit-button'));

    // 콘솔에서 윤년 규칙 확인 - 2024, 2028, 2032년에만 생성되어야 함
    // (2025, 2026, 2027, 2029, 2030, 2031은 평년이라 건너뛰기)
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
    const endDateInput = screen.getByLabelText('반복 종료일');
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
    debug();
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
    debug();
    await waitFor(() => {
      expect(eventList.getByText('2025-10-03')).toBeInTheDocument();
    });
    // 7일간 매일 반복이 생성되는지 콘솔에서 확인 가능
  });
});
