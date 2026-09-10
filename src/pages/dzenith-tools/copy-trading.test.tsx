import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import CopyTrading from './copy-trading';
import { CopyConnection, copyRequest } from './copy-api';

jest.mock('./copy-api', () => ({ ...jest.requireActual('./copy-api'), CopyConnection: jest.fn() }));
test('rejects invalid codes and unsafe stake filters', () => {
    expect(() => copyRequest('testcode123', '', '2')).toThrow();
    expect(() => copyRequest('testcode123', '3', '2')).toThrow();
    expect(() => copyRequest('https://example.com', '1', '2')).toThrow();
    expect(copyRequest('testcode123', '1', '2')).toEqual({
        copy_start: 'testcode123',
        min_trade_stake: 1,
        max_trade_stake: 2,
    });
});
test('connects without starting; requires review and consent before one start request', async () => {
    const request = jest.fn(async payload => {
        if (payload.authorize) return { authorize: { loginid: 'VRTC123', currency: 'USD', is_virtual: 1 } };
        if (payload.copy_start) return { copy_start: 1 };
        return { copytrading_list: { traders: [], copiers: [] } };
    });
    const close = jest.fn();
    (CopyConnection as jest.Mock).mockImplementation(() => ({ request, close }));
    const { unmount } = render(<CopyTrading />);
    fireEvent.change(screen.getByLabelText('Registered legacy App ID'), { target: { value: '12345' } });
    fireEvent.change(screen.getByLabelText('Your follower API token'), { target: { value: 'follower-test-only' } });
    fireEvent.click(screen.getByText('Connect follower account'));
    await screen.findByText('DEMO · VRTC123 · USD');
    await waitFor(() => expect(screen.getByText('Review copy setup ↗')).not.toBeDisabled());
    expect(request.mock.calls.some(([p]) => p.copy_start)).toBe(false);
    fireEvent.change(screen.getByLabelText('Lead trader’s copy token'), { target: { value: 'leadtest123' } });
    fireEvent.click(screen.getByText('Review copy setup ↗'));
    expect(screen.getByText('Confirm and start copying')).toBeDisabled();
    expect(request.mock.calls.some(([p]) => p.copy_start)).toBe(false);
    fireEvent.click(screen.getByRole('checkbox'));
    await act(async () => fireEvent.click(screen.getByText('Confirm and start copying')));
    expect(request.mock.calls.filter(([p]) => p.copy_start)).toHaveLength(1);
    expect(request).toHaveBeenCalledWith({ copy_start: 'leadtest123', min_trade_stake: 0.35, max_trade_stake: 2 });
    expect(screen.queryByText('Confirm and start copying')).toBeNull();
    unmount();
    expect(close).toHaveBeenCalled();
});
