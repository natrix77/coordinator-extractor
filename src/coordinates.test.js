import { parseCoordinates, polygonArea, closureGap, analyzeCoordinates } from './coordinates';

const tableText = `
1 516058.95 3917188.61 7.36
2 516066.19 3917187.36 7.68
3 516073.84 3917186.65 5.85
10 516095.75 3917176.17 19.53
61 516059.87 3917181.30 7.37
`;

test('parses A/A X Y L rows and ignores the length column', () => {
    const coords = parseCoordinates(tableText);
    expect(coords).toEqual([
        { x: '516058.95', y: '3917188.61' },
        { x: '516066.19', y: '3917187.36' },
        { x: '516073.84', y: '3917186.65' },
        { x: '516095.75', y: '3917176.17' },
        { x: '516059.87', y: '3917181.30' },
    ]);
});

test('accepts Y then X and comma decimals', () => {
    const coords = parseCoordinates('1 3917188,61 516058,95');
    expect(coords).toEqual([{ x: '516058.95', y: '3917188.61' }]);
});

test('does not treat grid ticks or short numbers as vertices', () => {
    expect(parseCoordinates('515000 3917200\n7.36 2.03')).toEqual([]);
});

test('reads two vertices on one line', () => {
    const coords = parseCoordinates('516058.95 3917188.61 516066.19 3917187.36');
    expect(coords).toHaveLength(2);
    expect(coords[0]).toEqual({ x: '516058.95', y: '3917188.61' });
    expect(coords[1]).toEqual({ x: '516066.19', y: '3917187.36' });
});

test('closure gap and area detect a broken polygon', () => {
    const good = [
        { x: '0.00', y: '0.00' },
        { x: '10.00', y: '0.00' },
        { x: '10.00', y: '10.00' },
        { x: '0.00', y: '10.00' },
    ];
    expect(polygonArea(good)).toBeCloseTo(100, 5);
    expect(closureGap(good)).toBeCloseTo(10, 5);
    expect(analyzeCoordinates(good).warnings).toEqual([]);

    const broken = parseCoordinates(`
516058.95 3917188.61
516066.19 3917187.36
516073.84 3917186.65
516080.20 3917185.01
516095.75 3917176.17
516115.17 3917174.12
516124.80 3917174.20
516126.56 3917150.98
516008.29 3917029.00
516070.73 3917076.62
516059.87 3917181.30
`);
    const analysis = analyzeCoordinates(broken);
    expect(analysis.gap).toBeGreaterThan(5);
    expect(analysis.warnings.length).toBeGreaterThan(0);
});

test('flags the client export as a low-quality polygon', () => {
    const fs = require('fs');
    const path = require('path');
    const raw = fs.readFileSync(path.join(__dirname, '..', 'test_case_26082601.txt'), 'utf8');
    const coords = parseCoordinates(raw);
    expect(coords).toHaveLength(59);
    const analysis = analyzeCoordinates(coords);
    expect(analysis.area).toBeCloseTo(3776.33, 1);
    expect(analysis.gap).toBeGreaterThan(25);
    expect(analysis.warnings.length).toBeGreaterThan(0);
});
