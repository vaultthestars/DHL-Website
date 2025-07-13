import React, { useState } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import { File } from 'react-pdf/dist/shared/types';

// Configure PDF.js worker once
pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.js`;

const PDFViewer = (pdfFile: File | undefined) => {
  const [numPages, setNumPages] = useState(0);
  const [pageNumber, setPageNumber] = useState(1);

  const onDocumentLoadSuccess = (numPages: any) => {
    setNumPages(numPages);
  };

  return (
    <div>
      <Document
        file={pdfFile} // Can be a URL, local import like import myPdf from './myPdf.pdf';
        onLoadSuccess = {onDocumentLoadSuccess}
      >
        <Page pageNumber={pageNumber} />
      </Document>
      <p>
        Page {pageNumber} of {numPages}
      </p>
    </div>
  );
};

export default PDFViewer;