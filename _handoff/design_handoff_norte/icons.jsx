// Norte — icon set (línea simple, currentColor)
/* global React */
(function () {
  const P = {
    grid: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z',
    layers: 'M12 3l9 5-9 5-9-5 9-5zM3 13l9 5 9-5M3 17l9 5 9-5',
    swap: 'M7 4v13M7 4l-3 3M7 4l3 3M17 20V7M17 20l-3-3M17 20l3-3',
    flag: 'M5 21V4M5 4h11l-2 4 2 4H5',
    wallet: 'M3 7h15a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7zM3 7l0-1a2 2 0 012-2h11M17 13h.01',
    pulse: 'M3 12h4l2-6 4 14 2-8h6',
    home: 'M4 11l8-7 8 7M6 10v9h12v-9',
    cart: 'M3 4h2l2.5 12h10L21 7H6M9 20a1 1 0 100-2 1 1 0 000 2zM17 20a1 1 0 100-2 1 1 0 000 2z',
    utensils: 'M5 3v8a2 2 0 002 2v8M7 3v6M16 3c-1.5 0-2.5 2-2.5 5s1 4 2.5 4v6',
    car: 'M5 13l1.5-5h11L19 13M4 13h16v5H4zM7 18v1M17 18v1M7 15h.01M17 15h.01',
    zap: 'M13 3l-8 10h6l-1 8 8-10h-6z',
    repeat: 'M4 9a6 6 0 0110-4l2 2M20 15a6 6 0 01-10 4l-2-2M16 3v4h-4M8 21v-4h4',
    heart: 'M12 20s-7-4.3-9.2-8.3A4.6 4.6 0 0112 6a4.6 4.6 0 019.2 5.7C19 15.7 12 20 12 20z',
    film: 'M4 4h16v16H4zM4 9h16M4 15h16M9 4v16M15 4v16',
    bag: 'M6 8h12l-1 12H7L6 8zM9 8V6a3 3 0 016 0v2',
    target: 'M12 3a9 9 0 100 18 9 9 0 000-18zM12 8a4 4 0 100 8 4 4 0 000-8zM12 12h.01',
    plus: 'M12 5v14M5 12h14',
    search: 'M11 4a7 7 0 100 14 7 7 0 000-14zM20 20l-4-4',
    bell: 'M6 9a6 6 0 1112 0c0 5 2 6 2 6H4s2-1 2-6M10 20a2 2 0 004 0',
    chevdown: 'M6 9l6 6 6-6',
    chevright: 'M9 6l6 6-6 6',
    arrowup: 'M12 19V5M12 5l-6 6M12 5l6 6',
    arrowdown: 'M12 5v14M12 19l-6-6M12 19l6-6',
    settings: 'M12 9a3 3 0 100 6 3 3 0 000-6zM19.4 13.5a1.6 1.6 0 00.3 1.7l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.6 1.6 0 00-2.7 1.1V21a2 2 0 11-4 0v-.1A1.6 1.6 0 006 19.4l-.1.1a2 2 0 11-2.8-2.8l.1-.1A1.6 1.6 0 003 13.5H3a2 2 0 110-4h.1A1.6 1.6 0 004.6 6l-.1-.1a2 2 0 112.8-2.8l.1.1A1.6 1.6 0 0010 3.6V3a2 2 0 114 0v.1a1.6 1.6 0 002.7 1.1l.1-.1a2 2 0 112.8 2.8l-.1.1a1.6 1.6 0 00.9 2.8H21a2 2 0 110 4h-.1a1.6 1.6 0 00-1.5 1z',
    calendar: 'M5 5h14v15H5zM5 9h14M9 3v4M15 3v4',
    trending: 'M3 17l6-6 4 4 8-8M21 7v5M21 7h-5',
    x: 'M6 6l12 12M18 6L6 18',
    sparkle: 'M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z',
    check: 'M5 12l5 5 9-11',
    minus: 'M5 12h14'
  };
  function Icon({ name, size, stroke, className, style }) {
    const d = P[name] || P.grid;
    return React.createElement('svg', {
      className: 'icon ' + (className || ''), width: size || 20, height: size || 20,
      viewBox: '0 0 24 24', fill: 'none', stroke: stroke || 'currentColor',
      strokeWidth: 1.7, strokeLinecap: 'round', strokeLinejoin: 'round', style: style
    }, React.createElement('path', { d: d }));
  }
  window.Icon = Icon;
})();
