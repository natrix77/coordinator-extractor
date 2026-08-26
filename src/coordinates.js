/**
 * Coordinate parsing and polygon quality checks for EGSA '87-style tables.
 */

const toNumber = (raw) => parseFloat(String(raw).replace(/,/g, '.'));

const integerDigits = (value) => String(Math.trunc(Math.abs(value))).length;

/**
 * Parses model/OCR text into { x, y } pairs.
 * Accepts only EGSA-like pairs (6-digit X, 7-digit Y), ignores A/A and L columns.
 */
export const parseCoordinates = (text) => {
    if (!text) return [];

    const coordinates = [];
    const lines = text.replace(/\r\n/g, '\n').split('\n');
    // 5–7 integer digits plus decimals, so L (e.g. 7.36) is not treated as a vertex.
    const numberRegex = /(\d{5,7}[.,]\d{1,4})/g;

    for (const line of lines) {
        let cleanLine = line.trim();
        if (!cleanLine) continue;
        cleanLine = cleanLine.replace(/^[\s`|*+>-]+/, '');

        const nums = [];
        let match;
        numberRegex.lastIndex = 0;
        while ((match = numberRegex.exec(cleanLine)) !== null) {
            const value = toNumber(match[1]);
            if (!Number.isNaN(value)) nums.push(value);
        }

        for (let i = 0; i < nums.length - 1; i++) {
            const a = nums[i];
            const b = nums[i + 1];
            const da = integerDigits(a);
            const db = integerDigits(b);
            let x;
            let y;
            if (da === 6 && db === 7) {
                x = a;
                y = b;
            } else if (da === 7 && db === 6) {
                y = a;
                x = b;
            } else {
                continue;
            }
            coordinates.push({ x: x.toFixed(2), y: y.toFixed(2) });
            i += 1;
        }
    }

    return coordinates.filter((c, i, arr) => i === 0 || c.x !== arr[i - 1].x || c.y !== arr[i - 1].y);
};

const toPoints = (coordinates) =>
    coordinates.map((c) => ({ x: parseFloat(c.x), y: parseFloat(c.y) }));

const hypotPts = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

export const polygonArea = (coordinates) => {
    const pts = toPoints(coordinates);
    const n = pts.length;
    if (n < 3) return 0;
    let sum = 0;
    for (let i = 0; i < n; i++) {
        const a = pts[i];
        const b = pts[(i + 1) % n];
        sum += a.x * b.y - b.x * a.y;
    }
    return Math.abs(sum) / 2;
};

export const closureGap = (coordinates) => {
    const pts = toPoints(coordinates);
    if (pts.length < 2) return 0;
    return hypotPts(pts[0], pts[pts.length - 1]);
};

const median = (values) => {
    if (!values.length) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};

export const analyzeCoordinates = (coordinates) => {
    const pts = toPoints(coordinates);
    const count = pts.length;
    const area = polygonArea(coordinates);
    const gap = closureGap(coordinates);
    const segments = [];
    for (let i = 0; i < Math.max(0, pts.length - 1); i++) {
        segments.push(hypotPts(pts[i], pts[i + 1]));
    }
    const medSeg = median(segments);
    const jumpLimit = Math.max(40, medSeg * 6);
    const longJumps = segments
        .map((length, index) => ({ index, length }))
        .filter((s) => s.length > jumpLimit);

    const warnings = [];
    if (count > 0 && count < 3) {
        warnings.push('Fewer than 3 points were extracted, so this cannot be a closed parcel.');
    }
    // Last→first is the closing side, not an error by itself. Warn only when it is
    // far larger than typical sides (common when the model skipped/invented vertices).
    if (count >= 8 && gap > Math.max(25, medSeg * 4)) {
        warnings.push(
            `Closing side is ${gap.toFixed(1)} m (typical sides ≈ ${medSeg.toFixed(1)} m). The first/last vertices may be wrong or missing.`
        );
    }
    if (count >= 8 && longJumps.length) {
        const first = longJumps[0];
        warnings.push(
            `Unusually long jump of ${first.length.toFixed(1)} m between points ${first.index + 1} and ${first.index + 2}. Some vertices may be missing or invented.`
        );
    }

    return {
        count,
        area,
        gap,
        longJumps,
        warnings,
    };
};

export const formatArea = (area) =>
    area.toLocaleString('el-GR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
