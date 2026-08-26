import { render, screen } from '@testing-library/react';
import App from './App';

jest.mock('./pdfToImages', () => ({
    pdfToImageDataUrls: jest.fn(),
    pdfToText: jest.fn(),
}));

test('renders Coordinate Extractor heading', () => {
  render(<App />);
  const heading = screen.getByText(/Coordinate Extractor/i);
  expect(heading).toBeInTheDocument();
});

test('renders upload instructions', () => {
  render(<App />);
  const instructions = screen.getByText(/Upload a topographic PDF/i);
  expect(instructions).toBeInTheDocument();
});

test('renders Gemini-powered footer', () => {
  render(<App />);
  expect(screen.getByText(/Powered by Gemini/i)).toBeInTheDocument();
});
