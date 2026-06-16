import React, { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { pdfToImageDataUrls } from './pdfToImages';

const GEMINI_MODEL = 'gemini-2.5-flash';
const OPENROUTER_MODELS = [
    'google/gemini-2.5-flash',
    'google/gemini-2.5-flash-lite',
];

// --- React Components ---

const Icon = ({ path, className = "w-6 h-6" }) => (
    <svg className={className} fill="currentColor" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg">
        <path fillRule="evenodd" d={path} clipRule="evenodd"></path>
    </svg>
);

const UploadIcon = () => <Icon path="M5.5 13.5a.5.5 0 0 1 .5.5v2a.5.5 0 0 1-1 0v-2a.5.5 0 0 1 .5-.5zM5 7.5a.5.5 0 0 1 .5-.5h2a.5.5 0 0 1 0 1h-2a.5.5 0 0 1-.5-.5zm.5 2.5a.5.5 0 0 0 0 1h5a.5.5 0 0 0 0-1h-5zM5 4.5a.5.5 0 0 1 .5-.5h5a.5.5 0 0 1 0 1h-5a.5.5 0 0 1-.5-.5zM11.5 16a.5.5 0 0 0-.5-.5h-2a.5.5 0 0 0 0 1h2a.5.5 0 0 0 .5-.5zm-1-4a.5.5 0 0 1 .5.5v1a.5.5 0 0 1-1 0v-1a.5.5 0 0 1 .5-.5zm-1 2.5a.5.5 0 0 0 0 1h5a.5.5 0 0 0 0-1h-5zM12 4.5a.5.5 0 0 1 .5-.5h2a.5.5 0 0 1 0 1h-2a.5.5 0 0 1-.5-.5zM2 2.5A2.5 2.5 0 0 1 4.5 0h11A2.5 2.5 0 0 1 18 2.5v15A2.5 2.5 0 0 1 15.5 20h-11A2.5 2.5 0 0 1 2 17.5v-15zM4.5 1h11a1.5 1.5 0 0 1 1.5 1.5v15a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 3 17.5v-15A1.5 1.5 0 0 1 4.5 1z" />;
const CopyIcon = () => <Icon path="M8 2a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H8zM2 6a2 2 0 0 1 2-2h1v12H4a2 2 0 0 1-2-2V6z" />;
const ClearIcon = () => <Icon path="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM8.707 7.293a1 1 0 0 0-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 1 0 1.414 1.414L10 11.414l1.293 1.293a1 1 0 0 0 1.414-1.414L11.414 10l1.293-1.293a1 1 0 0 0-1.414-1.414L10 8.586 8.707 7.293z" />;

/**
 * Parses the raw text extracted from the model to find coordinate pairs.
 * @param {string} text - The raw text from the AI model.
 * @returns {Array<Object>} An array of coordinate objects { x, y }.
 */
const parseCoordinates = (text) => {
    if (!text) return [];

    const coordinates = [];
    const lines = text.replace(/\r\n/g, '\n').split('\n');
    // Match all pairs of numbers (integer or decimal, dot or comma) on each line.
    const coordinateRegex = /([\d.,]+)\s+([\d.,]+)/g;

    for (const line of lines) {
        let cleanLine = line.trim();
        if (!cleanLine) continue;
        // Strip optional leading row index (e.g. A/A column) so "1 123,45 456,78" -> "123,45 456,78"
        cleanLine = cleanLine.replace(/^\d+\s+/, '');
        let match;
        coordinateRegex.lastIndex = 0;
        while ((match = coordinateRegex.exec(cleanLine)) !== null) {
            try {
                let val1 = parseFloat(match[1].replace(/,/g, '.'));
                let val2 = parseFloat(match[2].replace(/,/g, '.'));

                if (isNaN(val1) || isNaN(val2)) continue;

                let x, y;
                if (String(Math.trunc(val1)).length > String(Math.trunc(val2)).length) {
                    y = val1;
                    x = val2;
                } else {
                    x = val1;
                    y = val2;
                }

                coordinates.push({ x: x.toFixed(2), y: y.toFixed(2) });
            } catch (e) {
                console.error("Error parsing line:", line, e);
            }
        }
    }
    return coordinates;
};

const Dropzone = ({ onFileAccepted, disabled }) => {
    const onDrop = useCallback(acceptedFiles => {
        if (acceptedFiles.length > 0) {
            onFileAccepted(acceptedFiles[0]);
        }
    }, [onFileAccepted]);

    const { getRootProps, getInputProps, isDragActive } = useDropzone({
        onDrop,
        accept: { 'application/pdf': ['.pdf'] },
        disabled
    });

    return (
        <div {...getRootProps()} className={`p-8 border-2 border-dashed rounded-lg text-center cursor-pointer transition-colors ${isDragActive ? 'border-blue-500 bg-blue-50' : 'border-gray-300 bg-gray-50'} ${disabled ? 'cursor-not-allowed opacity-50' : 'hover:border-blue-400'}`}>
            <input {...getInputProps()} />
            <div className="flex flex-col items-center justify-center text-gray-500">
                <UploadIcon />
                {isDragActive ?
                    <p className="mt-2">Drop the file here ...</p> :
                    <p className="mt-2">Drag & drop a PDF file here, or click to select file</p>
                }
            </div>
        </div>
    );
};

const ResultsTable = ({ coordinates, onCopyToClipboard }) => (
    <div className="mt-6">
        <div className="flex justify-between items-center mb-2">
            <h3 className="text-xl font-semibold text-gray-700">
                Extracted Coordinates ({coordinates.length})
            </h3>
            <button
                onClick={onCopyToClipboard}
                className="flex items-center px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors disabled:opacity-50"
                disabled={coordinates.length === 0}
            >
                <CopyIcon />
                <span className="ml-2">Copy X Y</span>
            </button>
        </div>
        <div className="overflow-auto rounded-lg shadow" style={{maxHeight: '400px'}}>
            <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-100 sticky top-0">
                    <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">A/A</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">X</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Y</th>
                    </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                    {coordinates.map((coord, index) => (
                        <tr key={index} className="hover:bg-gray-50">
                            <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{coord.id}</td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{coord.x}</td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{coord.y}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    </div>
);

const App = () => {
    const [file, setFile] = useState(null);
    const [coordinates, setCoordinates] = useState([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');
    const [message, setMessage] = useState('');

    const handleFileAccepted = (selectedFile) => {
        resetState();
        setFile(selectedFile);
        setError('');
    };
    
    const resetState = () => {
        setFile(null);
        setCoordinates([]);
        setIsLoading(false);
        setError('');
        setMessage('');
    };

    const handleExtract = async () => {
        if (!file) {
            setError('Please select a file first.');
            return;
        }

        setIsLoading(true);
        setError('');
        setCoordinates([]);

        const openRouterKey = process.env.REACT_APP_OPENROUTER_API_KEY;
        const openaiKey = process.env.REACT_APP_OPENAI_API_KEY;
        const geminiKey = process.env.REACT_APP_GEMINI_API_KEY;
        const controller = new AbortController();
        const timeoutMs = 120000; // 2 min for API extraction
        const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
        const prompt = "Extract text from any tables containing coordinate pairs from this document. The table has columns like 'A/A', 'X', and 'Y'. Return only the raw text of the table rows, one row per line. Do not include headers or any other text.";

        const setExtractError = (err, provider) => {
            if (err.name === 'AbortError') {
                setError('The request took too long and was cancelled. Please try again with a smaller file.');
            } else if (err.status === 429) {
                const base = 'Rate limit exceeded. Please wait a few minutes and try again.';
                const hint = provider === 'OpenAI'
                    ? ' You can check usage and limits at platform.openai.com.'
                    : provider === 'OpenRouter'
                    ? ' Check openrouter.ai/dashboard for limits.'
                    : provider ? ` (${provider})` : '';
                setError(base + hint);
            } else {
                setError(`An error occurred: ${err.message}. Please try again.`);
            }
        };

        const applyExtractedText = (extractedText) => {
            const parsedCoords = parseCoordinates(extractedText);
            const finalCoordinates = parsedCoords.map((coord, index) => ({
                id: index,
                x: coord.x,
                y: coord.y
            }));
            setCoordinates(finalCoordinates);
            if (finalCoordinates.length === 0) {
                setError("Could not find any coordinates. The document might have an unusual format or contain no coordinate tables.");
            }
        };

        const runOpenAIExtract = async (pdfFile) => {
            const imageUrls = await pdfToImageDataUrls(pdfFile);
            const content = [
                { type: 'text', text: prompt },
                ...imageUrls.map(url => ({ type: 'image_url', image_url: { url } }))
            ];
            const body = JSON.stringify({
                model: 'gpt-4o',
                messages: [{ role: 'user', content }],
                max_tokens: 4096
            });
            const doFetch = () => fetch('https://api.openai.com/v1/chat/completions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${openaiKey}` },
                body,
                signal: controller.signal
            });
            let response = await doFetch();
            const backoffSeconds = [8, 20, 45];
            for (let i = 0; i < backoffSeconds.length && response.status === 429; i++) {
                await new Promise(r => setTimeout(r, backoffSeconds[i] * 1000));
                response = await doFetch();
            }
            if (!response.ok) throw Object.assign(new Error(`API call failed with status: ${response.status}`), { status: response.status });
            const result = await response.json();
            const text = result.choices?.[0]?.message?.content;
            if (!text) throw new Error("No content found in API response.");
            return text;
        };

        const runOpenRouterExtract = async (pdfFile) => {
            const imageUrls = await pdfToImageDataUrls(pdfFile);
            const content = [
                { type: 'text', text: prompt },
                ...imageUrls.map(url => ({ type: 'image_url', image_url: { url } }))
            ];
            let lastError;
            for (const model of OPENROUTER_MODELS) {
                const body = JSON.stringify({
                    model,
                    messages: [{ role: 'user', content }],
                    max_tokens: 4096
                });
                const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${openRouterKey}`,
                        'HTTP-Referer': window.location.origin || 'https://localhost:3000'
                    },
                    body,
                    signal: controller.signal
                });
                if (response.ok) {
                    const result = await response.json();
                    const text = result.choices?.[0]?.message?.content;
                    if (text) return text;
                }
                lastError = Object.assign(new Error(`API call failed with status: ${response.status}`), { status: response.status });
                if (response.status !== 404) break;
            }
            throw lastError;
        };

        // Try OpenRouter first (free tier). On any failure, fall back to Gemini then OpenAI so one working key is enough.
        if (openRouterKey) {
            (async () => {
                try {
                    const text = await runOpenRouterExtract(file);
                    clearTimeout(timeoutId);
                    applyExtractedText(text);
                } catch (err) {
                    clearTimeout(timeoutId);
                    let lastErr = err;
                    if (geminiKey) {
                        try {
                            const base64Data = await new Promise((resolve, reject) => {
                                const fr = new FileReader();
                                fr.onload = () => resolve(fr.result.split(',')[1]);
                                fr.onerror = () => reject(new Error('Failed to read file'));
                                fr.readAsDataURL(file);
                            });
                            const payload = {
                                contents: [{ parts: [{ text: prompt }, { inline_data: { mime_type: file.type, data: base64Data } }] }]
                            };
                            const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${geminiKey}`, {
                                method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload), signal: controller.signal
                            });
                            if (!res.ok) {
                                throw Object.assign(new Error(`API call failed with status: ${res.status}`), { status: res.status });
                            }
                            const data = await res.json();
                            const t = data.candidates?.[0]?.content?.parts?.[0]?.text;
                            if (t) { applyExtractedText(t); setIsLoading(false); return; }
                            throw new Error('No content found in API response.');
                        } catch (fallbackErr) {
                            lastErr = fallbackErr;
                        }
                    }
                    if (openaiKey) {
                        try {
                            const t = await runOpenAIExtract(file);
                            applyExtractedText(t);
                            setIsLoading(false);
                            return;
                        } catch (fallbackErr) {
                            lastErr = fallbackErr;
                        }
                    }
                    setExtractError(lastErr, lastErr === err ? 'OpenRouter' : (geminiKey ? 'Gemini' : 'OpenAI'));
                } finally {
                    setIsLoading(false);
                }
            })();
            return;
        }

        // Prefer Gemini first (accepts PDF directly, avoids OpenAI rate limits). Fall back to OpenAI if only OpenAI key is set.
        if (geminiKey) {
            // --- Gemini: PDF base64 → Generate Content API. On 429: fall back to OpenAI if available, else retry with backoff. ---
            const fileReader = new FileReader();
            fileReader.onload = async (e) => {
                try {
                    const base64Data = e.target.result.split(',')[1];
                    const payload = {
                        contents: [{
                            parts: [
                                { text: prompt },
                                { inline_data: { mime_type: file.type, data: base64Data } }
                            ]
                        }]
                    };
                    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${geminiKey}`;
                    let response = await fetch(apiUrl, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(payload),
                        signal: controller.signal
                    });

                    if (response.status === 429 && openaiKey) {
                        clearTimeout(timeoutId);
                        try {
                            const text = await runOpenAIExtract(file);
                            applyExtractedText(text);
                        } catch (fallbackErr) {
                            setExtractError(fallbackErr, 'OpenAI');
                        }
                        setIsLoading(false);
                        return;
                    }

                    if (response.status === 429) {
                        const backoff = [10, 30, 60];
                        for (let i = 0; i < backoff.length; i++) {
                            await new Promise(r => setTimeout(r, backoff[i] * 1000));
                            response = await fetch(apiUrl, {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify(payload),
                                signal: controller.signal
                            });
                            if (response.ok) break;
                            if (response.status !== 429) break;
                        }
                    }

                    clearTimeout(timeoutId);
                    if (!response.ok) {
                        const err = new Error(`API call failed with status: ${response.status}`);
                        err.status = response.status;
                        throw err;
                    }
                    const result = await response.json();
                    if (result.candidates?.[0]?.content?.parts?.[0]?.text) {
                        applyExtractedText(result.candidates[0].content.parts[0].text);
                    } else {
                        throw new Error("No content found in API response. The document might be empty or unreadable.");
                    }
                } catch (err) {
                    setExtractError(err, 'Gemini');
                } finally {
                    setIsLoading(false);
                }
            };
            fileReader.onerror = () => {
                setError('Failed to read the file.');
                setIsLoading(false);
                clearTimeout(timeoutId);
            };
            fileReader.readAsDataURL(file);
            return;
        }

        if (openaiKey) {
            // --- OpenAI: PDF → images → Vision API. On 429, retry with backoff. ---
            (async () => {
                try {
                    const imageUrls = await pdfToImageDataUrls(file);
                    const content = [
                        { type: 'text', text: prompt },
                        ...imageUrls.map(url => ({ type: 'image_url', image_url: { url } }))
                    ];
                    const body = JSON.stringify({
                        model: 'gpt-4o',
                        messages: [{ role: 'user', content }],
                        max_tokens: 4096
                    });
                    const doOpenAIFetch = () => fetch('https://api.openai.com/v1/chat/completions', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${openaiKey}`
                        },
                        body,
                        signal: controller.signal
                    });

                    let response = await doOpenAIFetch();
                    const backoffSeconds = [8, 20, 45];
                    for (let i = 0; i < backoffSeconds.length && response.status === 429; i++) {
                        await new Promise(r => setTimeout(r, backoffSeconds[i] * 1000));
                        response = await doOpenAIFetch();
                    }
                    clearTimeout(timeoutId);

                    if (!response.ok) {
                        const err = new Error(`API call failed with status: ${response.status}`);
                        err.status = response.status;
                        throw err;
                    }
                    const result = await response.json();
                    const text = result.choices?.[0]?.message?.content;
                    if (!text) throw new Error("No content found in API response. The document might be empty or unreadable.");
                    applyExtractedText(text);
                } catch (err) {
                    setExtractError(err, 'OpenAI');
                } finally {
                    setIsLoading(false);
                }
            })();
            return;
        }

        setError('No API key configured. Add REACT_APP_OPENROUTER_API_KEY, REACT_APP_GEMINI_API_KEY, or REACT_APP_OPENAI_API_KEY to your .env file.');
        setIsLoading(false);
        clearTimeout(timeoutId);
    };

    const copyToClipboard = () => {
        if (coordinates.length === 0) return;
        const spaceSeparatedContent = coordinates.map(c => `${c.x} ${c.y}`).join("\n");
        
        const textArea = document.createElement("textarea");
        textArea.value = spaceSeparatedContent;
        document.body.appendChild(textArea);
        try {
            textArea.select();
            document.execCommand('copy');
            setMessage('Copied to clipboard!');
            setTimeout(() => setMessage(''), 2000);
        } catch (err) {
            setError('Failed to copy to clipboard.');
        }
        document.body.removeChild(textArea);
    };


    return (
        <div className="bg-gray-100 min-h-screen font-sans">
            <div className="container mx-auto p-4 md:p-8">
                <header className="text-center mb-8">
                    <h1 className="text-4xl font-bold text-gray-800">Coordinate Extractor</h1>
                    <p className="text-gray-600 mt-2">Upload a PDF to automatically extract coordinate pairs.</p>
                </header>

                <div className="max-w-4xl mx-auto bg-white p-6 rounded-xl shadow-lg">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-center">
                        <div>
                            <h2 className="text-2xl font-semibold text-gray-700 mb-4">1. Upload File</h2>
                            <Dropzone onFileAccepted={handleFileAccepted} disabled={isLoading} />
                             {file && !isLoading && (
                                <div className="mt-4 flex justify-between items-center bg-gray-100 p-3 rounded-lg">
                                    <p className="text-gray-700 truncate">{file.name}</p>
                                    <button onClick={resetState} className="text-gray-500 hover:text-red-700">
                                        <ClearIcon />
                                    </button>
                                </div>
                            )}
                        </div>
                        <div className="flex flex-col items-stretch space-y-3">
                            <h2 className="text-2xl font-semibold text-gray-700 mb-1">2. Actions</h2>
                            <button
                                onClick={handleExtract}
                                disabled={!file || isLoading}
                                className="w-full px-6 py-3 bg-blue-600 text-white font-semibold rounded-lg shadow-md hover:bg-blue-700 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed"
                            >
                                {isLoading ? 'Extracting...' : 'Extract Coordinates (AI)'}
                            </button>
                            <button
                                type="button"
                                onClick={resetState}
                                disabled={isLoading || !file}
                                className="w-full px-6 py-2 bg-red-500 text-white font-semibold rounded-lg shadow-md hover:bg-red-600 transition-colors disabled:bg-gray-400"
                            >
                                Clear
                            </button>
                        </div>
                    </div>
                    
                    {isLoading && (
                        <div className="text-center p-8">
                            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto"></div>
                            <p className="mt-4 text-gray-600">Analyzing PDF…</p>
                        </div>
                    )}

                    {error && (
                        <div className="mt-6 p-4 bg-red-100 text-red-700 border border-red-300 rounded-lg">
                            <strong>Error:</strong> {error}
                        </div>
                    )}
                     {message && (
                        <div className="mt-6 p-4 bg-green-100 text-green-700 border border-green-300 rounded-lg">
                           {message}
                        </div>
                    )}

                    {!isLoading && coordinates.length > 0 && (
                        <ResultsTable coordinates={coordinates} onCopyToClipboard={copyToClipboard} />
                    )}
                    
                </div>
                 <footer className="text-center mt-8 text-gray-500 text-sm">
                    <p>Powered by Gemini or OpenAI</p>
                </footer>
            </div>
        </div>
    );
};

export default App;
