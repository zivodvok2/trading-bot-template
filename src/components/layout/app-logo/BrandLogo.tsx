type TBrandLogoProps = { width?: number; height?: number; fill?: string; className?: string };

/** D-Zenith mark: a north-star inside a trading horizon. */
export const BrandLogo = ({ width = 132, height = 36, fill = 'currentColor', className = '' }: TBrandLogoProps) => (
    <svg width={width} height={height} viewBox='0 0 132 36' fill='none' xmlns='http://www.w3.org/2000/svg' className={className} role='img' aria-label='D-Zenith'>
        <defs>
            <linearGradient id='dz-mark' x1='3' y1='2' x2='31' y2='32' gradientUnits='userSpaceOnUse'><stop stopColor='#12C7B0' /><stop offset='1' stopColor='#6D5EF5' /></linearGradient>
            <linearGradient id='dz-word' x1='42' y1='7' x2='124' y2='29' gradientUnits='userSpaceOnUse'><stop stopColor={fill === 'currentColor' ? '#F8FAFC' : fill} /><stop offset='1' stopColor='#A7B3D6' /></linearGradient>
        </defs>
        <path d='M18 2.5 22.1 12l9.4 4-9.4 4L18 29.5 13.9 20 4.5 16l9.4-4L18 2.5Z' fill='url(#dz-mark)' />
        <path d='M18 8v16M10 16h16' stroke='#fff' strokeWidth='1.4' strokeLinecap='round' opacity='.85' />
        <path d='M5 31.5h26' stroke='#12C7B0' strokeWidth='1.5' strokeLinecap='round' opacity='.8' />
        <text x='40' y='24' fill='url(#dz-word)' fontFamily='Inter, Arial, sans-serif' fontSize='18' fontWeight='800' letterSpacing='-.6'>D-ZENITH</text>
    </svg>
);