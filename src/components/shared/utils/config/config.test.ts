import { isLocalHostname, isProductionHostname } from './config';

describe('isLocalHostname', () => {
    test.each([
        ['localhost', true],
        ['127.0.0.1', true],
        ['::1', true],
        ['192.168.1.42', true],
        ['192.168.0.1', true],
        ['10.0.0.5', true],
        ['10.255.255.255', true],
        ['172.16.0.1', true],
        ['172.31.255.255', true],
        ['my-laptop.local', true],
        ['staging.d-zenith.vercel.app', false],
        ['d-zenith.vercel.app', false],
        ['172.32.0.1', false],
        ['172.15.0.1', false],
        ['11.0.0.5', false],
        ['example.com', false],
    ])('treats %s as local = %s', (hostname, expected) => {
        expect(isLocalHostname(hostname)).toBe(expected);
    });
});

describe('isProductionHostname', () => {
    test('matches the configured production domain', () => {
        expect(isProductionHostname('d-zenith.vercel.app')).toBe(true);
    });

    test('does not match a LAN IP or staging domain', () => {
        expect(isProductionHostname('192.168.1.42')).toBe(false);
        expect(isProductionHostname('staging.d-zenith.vercel.app')).toBe(false);
    });
});
