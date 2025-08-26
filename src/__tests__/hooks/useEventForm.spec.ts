import { renderHook } from '@testing-library/react';

import { useEventForm } from '../../hooks/useEventForm';

describe('반복 일정', () => {
  it('각 반복 유형에 대해 간격을 설정할 수 있다.', () => {
    const { result } = renderHook(() => useEventForm());
    expect(result.current.title).toBe('');
  });
});
