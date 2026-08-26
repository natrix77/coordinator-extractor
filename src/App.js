import React, { useState, useCallback, useEffect } from 'react';
import { useDropzone } from 'react-dropzone';
import { pdfToImageDataUrls } from './pdfToImages';
import { parseCoordinates, analyzeCoordinates, formatArea } from './coordinates';

const GEMINI_MODEL = 'gemini-3.6-flash';
const HAS_GEMINI_KEY = Boolean(process.env.REACT_APP_GEMINI_API_KEY);

// --- React Components ---

const Icon = ({ path, className = "w-6 h-6" }) => (
    <svg className={className} fill="currentColor" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg">
        <path fillRule="evenodd" d={path} clipRule="evenodd"></path>
    </svg>
);

const UploadIcon = () => <Icon path="M5.5 13.5a.5.5 0 0 1 .5.5v2a.5.5 0 0 1-1 0v-2a.5.5 0 0 1 .5-.5zM5 7.5a.5.5 0 0 1 .5-.5h2a.5.5 0 0 1 0 1h-2a.5.5 0 0 1-.5-.5zm.5 2.5a.5.5 0 0 0 0 1h5a.5.5 0 0 0 0-1h-5zM5 4.5a.5.5 0 0 1 .5-.5h5a.5.5 0 0 1 0 1h-5a.5.5 0 0 1-.5-.5zM11.5 16a.5.5 0 0 0-.5-.5h-2a.5.5 0 0 0 0 1h2a.5.5 0 0 0 .5-.5zm-1-4a.5.5 0 0 1 .5.5v1a.5.5 0 0 1-1 0v-1a.5.5 0 0 1 .5-.5zm-1 2.5a.5.5 0 0 0 0 1h5a.5.5 0 0 0 0-1h-5zM12 4.5a.5.5 0 0 1 .5-.5h2a.5.5 0 0 1 0 1h-2a.5.5 0 0 1-.5-.5zM2 2.5A2.5 2.5 0 0 1 4.5 0h11A2.5 2.5 0 0 1 18 2.5v15A2.5 2.5 0 0 1 15.5 20h-11A2.5 2.5 0 0 1 2 17.5v-15zM4.5 1h11a1.5 1.5 0 0 1 1.5 1.5v15a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 3 17.5v-15A1.5 1.5 0 0 1 4.5 1z" />;
const CopyIcon = () => <Icon path="M8 2a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H8zM2 6a2 2 0 0 1 2-2h1v12H4a2 2 0 0 1-2-2V6z" />;
const ClearIcon = () => <Icon path="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM8.707 7.293a1 1 0 0 0-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 1 0 1.414 1.414L10 11.414l1.293 1.293a1 1 0 0 0 1.414-1.414L11.414 10l1.293-1.293a1 1 0 0 0-1.414-1.414L10 8.586 8.707 7.293z" />;

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

const ResultsTable = ({ coordinates, analysis, onCopyToClipboard }) => (
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
        {analysis && (
            <div className="mb-3 text-sm text-gray-600">
                Computed area: <strong>{formatArea(analysis.area)} m²</strong>
                {' · '}
                Closing side: <strong>{analysis.gap.toFixed(2)} m</strong>
                <span className="ml-1 text-gray-500">(compare area with ΕΜΒΑΔΟΝ on the drawing)</span>
            </div>
        )}
        {analysis?.warnings?.length > 0 && (
            <div className="mb-3 p-3 bg-amber-50 text-amber-900 border border-amber-300 rounded-lg text-sm">
                <strong>Check extraction quality:</strong>
                <ul className="list-disc ml-5 mt-1">
                    {analysis.warnings.map((w, i) => (
                        <li key={i}>{w}</li>
                    ))}
                </ul>
            </div>
        )}
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

const formatElapsed = (sec) => `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;

const App = () => {
    const [file, setFile] = useState(null);
    const [coordinates, setCoordinates] = useState([]);
    const [isLoading, setIsLoading] = useState(false);
    const [extractStatus, setExtractStatus] = useState('');
    const [elapsedSec, setElapsedSec] = useState(0);
    const [error, setError] = useState('');
    const [message, setMessage] = useState('');

    useEffect(() => {
        if (!isLoading) {
            setElapsedSec(0);
            return undefined;
        }
        const started = Date.now();
        const id = setInterval(() => {
            setElapsedSec(Math.floor((Date.now() - started) / 1000));
        }, 250);
        return () => clearInterval(id);
    }, [isLoading]);

    const handleFileAccepted = (selectedFile) => {
        resetState();
        setFile(selectedFile);
        setError('');
    };
    
    const resetState = () => {
        setFile(null);
        setCoordinates([]);
        setIsLoading(false);
        setExtractStatus('');
        setError('');
        setMessage('');
    };

    const handleExtract = async () => {
        if (!file) {
            setError('Please select a file first.');
            return;
        }

        const geminiKey = process.env.REACT_APP_GEMINI_API_KEY;
        if (!geminiKey) {
            setError('Gemini is not configured in this site build. In Netlify, set REACT_APP_GEMINI_API_KEY, then Deploys -> Trigger deploy -> Clear cache and deploy site.');
            return;
        }

        setIsLoading(true);
        setExtractStatus('Starting Gemini...');
        setError('');
        setCoordinates([]);

        const controller = new AbortController();
        let cancelled = false;
        const timeoutMs = 180000;
        const timeoutId = setTimeout(() => {
            cancelled = true;
            controller.abort();
            setExtractStatus('');
            setIsLoading(false);
            setError('The request took too long and was cancelled. Please try again with a smaller file.');
        }, timeoutMs);
        const isCancelled = () => cancelled || controller.signal.aborted;
        const prompt = "Extract EVERY row from the vertex coordinate table (ΠΙΝΑΚΑΣ ΣΥΝΤΕΤΑΓΜΕΝΩΝ / columns A/A or Κορυφές, X, Y). Return one vertex per line as: index X Y using the exact printed digits. Copy every numbered row from first to last. Do not skip, merge, interpolate, or invent points. Do not include the L/πλευρά length column, headers, or any other text.";

        (async () => {
            try {
                setExtractStatus('Rendering PDF pages for Gemini...');
                const imageUrls = await pdfToImageDataUrls(file, {
                    signal: controller.signal,
                    onProgress: setExtractStatus,
                });
                if (isCancelled()) return;
                setExtractStatus('Sending images to Gemini...');
                const imageParts = imageUrls.map((url) => {
                    const comma = url.indexOf(',');
                    const mime = url.startsWith('data:image/jpeg') ? 'image/jpeg' : 'image/png';
                    return { inline_data: { mime_type: mime, data: url.slice(comma + 1) } };
                });
                const payload = {
                    contents: [{
                        parts: [
                            { text: prompt },
                            ...imageParts
                        ]
                    }],
                    generationConfig: {
                        temperature: 0,
                        maxOutputTokens: 8192
                    }
                };
                const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${geminiKey}`;
                const response = await fetch(apiUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload),
                    signal: controller.signal
                });
                if (isCancelled()) return;
                const data = await response.json().catch(() => ({}));
                if (!response.ok) {
                    const apiMessage = data?.error?.message || `API call failed with status: ${response.status}`;
                    if (response.status === 429) {
                        setError(`Gemini rate limit exceeded. Wait a few minutes and try once. Confirm this Netlify build includes REACT_APP_GEMINI_API_KEY from the paid project. (${apiMessage})`);
                    } else {
                        setError(`Gemini error (${response.status}): ${apiMessage}`);
                    }
                    return;
                }
                const parts = data.candidates?.[0]?.content?.parts || [];
                const extractedText = parts.map((part) => part.text).filter(Boolean).join('\n');
                const finishReason = data.candidates?.[0]?.finishReason;
                if (!extractedText) {
                    const block = data.promptFeedback?.blockReason;
                    throw new Error(block
                        ? `Gemini blocked the document (${block}).`
                        : `No text in Gemini response${finishReason ? ` (${finishReason})` : ''}.`);
                }
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
            } catch (err) {
                if (isCancelled() || err.name === 'AbortError') return;
                setError(`Gemini error: ${err.message}`);
            } finally {
                clearTimeout(timeoutId);
                if (!cancelled) {
                    setIsLoading(false);
                    setExtractStatus('');
                }
            }
        })();
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


    const analysis = coordinates.length ? analyzeCoordinates(coordinates) : null;

    return (
        <div className="bg-gray-100 min-h-screen font-sans">
            <div className="container mx-auto p-4 md:p-8">
                <header className="text-center mb-8">
                    <h1 className="text-4xl font-bold text-gray-800">Coordinate Extractor</h1>
                    <p className="text-gray-600 mt-2">Upload a PDF to automatically extract coordinate pairs.</p>
                    {HAS_GEMINI_KEY ? (
                        <p className="text-sm text-green-700 mt-2">This build uses Gemini.</p>
                    ) : (
                        <p className="text-sm text-amber-700 mt-2">Gemini key is missing from this build. Set REACT_APP_GEMINI_API_KEY on Netlify, then Clear cache and deploy.</p>
                    )}
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
                            <p className="mt-4 text-gray-700 font-medium">Analyzing PDF… {formatElapsed(elapsedSec)}</p>
                            {extractStatus && (
                                <p className="mt-2 text-sm text-gray-500">{extractStatus}</p>
                            )}
                            <p className="mt-2 text-xs text-gray-400">Large scanned drawings can take up to 3 minutes.</p>
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
                        <ResultsTable coordinates={coordinates} analysis={analysis} onCopyToClipboard={copyToClipboard} />
                    )}
                    
                </div>
                 <footer className="text-center mt-8 text-gray-500 text-sm">
                    <p>Powered by Gemini</p>
                </footer>
            </div>
        </div>
    );
};

export default App;
