import { parseCoordinates, polygonArea, closureGap, analyzeCoordinates, mergeCoordinateLists, shouldContinueExtraction, parsePrintedArea, parsePrintedCount } from './coordinates';

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

test('merges continuation rows without duplicating the overlap', () => {
    const first = parseCoordinates('1 516058.95 3917188.61\n2 516066.19 3917187.36');
    const more = parseCoordinates('2 516066.19 3917187.36\n3 516073.84 3917186.65');
    expect(mergeCoordinateLists(first, more)).toEqual([
        { x: '516058.95', y: '3917188.61' },
        { x: '516066.19', y: '3917187.36' },
        { x: '516073.84', y: '3917186.65' },
    ]);
});

test('the 14-point Routzaki prefix needs a continuation pass', () => {
    const coords = parseCoordinates(`
516058.95 3917188.61
516066.19 3917187.36
516073.84 3917186.65
516079.66 3917186.84
516088.24 3917187.84
516088.84 3917187.54
516094.46 3917185.11
516095.61 3917183.44
516095.83 3917181.34
516095.75 3917176.17
516115.17 3917174.12
516124.80 3917174.20
516127.25 3917173.73
516126.56 3917150.98
`);
    expect(coords).toHaveLength(14);
    const analysis = analyzeCoordinates(coords);
    expect(analysis.area).toBeCloseTo(796.16, 0);
    expect(analysis.gap).toBeGreaterThan(70);
    expect(analysis.quality).toBe('review');
    expect(shouldContinueExtraction(coords)).toBe(true);
});

test('pairs X and Y on separate lines and drops a repeated closing vertex', () => {
    const coords = parseCoordinates(`
515945.646
3917090.129
515944.293
3917089.696
515943.082
3917088.464
515945.646
3917090.129
`);
    expect(coords).toEqual([
        { x: '515945.646', y: '3917090.129' },
        { x: '515944.293', y: '3917089.696' },
        { x: '515943.082', y: '3917088.464' },
    ]);
});

test('parses printed area and vertex count from drawing text', () => {
    expect(parsePrintedArea('AREA 4197.62\nCOUNT 61')).toBeCloseTo(4197.62);
    expect(parsePrintedCount('AREA 4197.62\nCOUNT 61')).toBe(61);
    expect(parsePrintedArea('ΕΜΒΑΔΟΝ IΔΙΟΚΤΗΣΙΑΣ (1, 2, 3, ..., 41, 42, 1) Ε=3731.03 τ.μ.')).toBeCloseTo(3731.03);
    expect(parsePrintedCount('ΕΜΒΑΔΟΝ IΔΙΟΚΤΗΣΙΑΣ (1, 2, 3, ..., 41, 42, 1) Ε=3731.03 τ.μ.')).toBe(42);
    expect(parsePrintedArea('ΕΜΒΑΔΟΝ 4.197,62 m²')).toBeCloseTo(4197.62);
});

test('marks a polygon verified when area and side lengths match the drawing', () => {
    const square = [
        { x: '516000.00', y: '3917000.00' },
        { x: '516010.00', y: '3917000.00' },
        { x: '516010.00', y: '3917010.00' },
        { x: '516000.00', y: '3917010.00' },
    ];
    const verified = analyzeCoordinates(square, {
        printedArea: 100,
        sideLengths: [10, 10, 10, 10],
    });
    expect(verified.warnings).toEqual([]);
    expect(verified.quality).toBe('verified');

    const mismatch = analyzeCoordinates(square, { printedArea: 4197.62 });
    expect(mismatch.quality).toBe('review');
    expect(shouldContinueExtraction(square, { printedArea: 4197.62 })).toBe(true);
});
