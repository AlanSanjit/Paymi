'use client'

import { useRef, useState } from 'react'
import './page.css'

export default function Home() {
  const fileInputRef = useRef(null)
  const [isDragging, setIsDragging] = useState(false)
  const [selectedFile, setSelectedFile] = useState(null)
  const [isLoading, setIsLoading] = useState(false)
  const [receiptData, setReceiptData] = useState(null)
  const [error, setError] = useState(null)

  const handleFileSelect = (file) => {
    if (file && (file.type.startsWith('image/') || file.type === 'application/pdf')) {
      setSelectedFile(file)
    } else {
      alert('Please select an image or PDF file')
    }
  }

  const handleDrop = (e) => {
    e.preventDefault()
    setIsDragging(false)
    
    const file = e.dataTransfer.files[0]
    if (file) {
      handleFileSelect(file)
    }
  }

  const handleDragOver = (e) => {
    e.preventDefault()
    setIsDragging(true)
  }

  const handleDragLeave = (e) => {
    e.preventDefault()
    setIsDragging(false)
  }

  const handleFileInputChange = (e) => {
    const file = e.target.files[0]
    if (file) {
      handleFileSelect(file)
    }
  }

  const handleClick = () => {
    fileInputRef.current?.click()
  }

  const handleSubmit = async () => {
    if (!selectedFile) return

    setIsLoading(true)
    setError(null)
    setReceiptData(null)

    try {
      const formData = new FormData()
      formData.append('file', selectedFile)

      const response = await fetch('http://127.0.0.1:8002/upload_receipt', {
        method: 'POST',
        body: formData,
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.detail || 'Failed to process receipt')
      }

      const data = await response.json()
      setReceiptData(data)
      console.log('Receipt parsed successfully:', data)
    } catch (err) {
      setError(err.message || 'An error occurred while processing the receipt')
      console.error('Error:', err)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="scan-page">
      <div className="upload-container">
        <div 
          className={`dropbox ${isDragging ? 'dragging' : ''} ${selectedFile ? 'has-file' : ''}`}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onClick={handleClick}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,application/pdf"
            onChange={handleFileInputChange}
            style={{ display: 'none' }}
          />
          
          <div className="dropbox-content">
            {selectedFile ? (
              <div className="file-info">
                <div className="file-icon">📄</div>
                <p className="file-name">{selectedFile.name}</p>
              </div>
            ) : (
              <div className="dropbox-hint">
                <div className="upload-icon">📤</div>
                <p>Drop your receipt here or click to browse</p>
              </div>
            )}
          </div>
        </div>
        
        <button 
          className="submit-btn" 
          onClick={handleSubmit}
          disabled={!selectedFile || isLoading}
        >
          {isLoading ? 'Processing...' : 'Submit'}
        </button>
        
        {error && (
          <div className="error-message" style={{ marginTop: '1rem', color: '#ff4444', padding: '0.5rem', background: 'rgba(255, 68, 68, 0.1)', borderRadius: '8px' }}>
            Error: {error}
          </div>
        )}
        
        {receiptData && (
          <div className="receipt-result" style={{ marginTop: '1rem', padding: '1rem', background: '#f5f5f5', borderRadius: '8px', color: '#000000' }}>
            <h3 style={{ color: '#000000', margin: '0 0 0.5rem 0' }}>Receipt Parsed Successfully!</h3>
            <p style={{ color: '#000000', margin: '0.5rem 0' }}><strong>Total:</strong> ${receiptData.total.toFixed(2)}</p>
            <p style={{ color: '#000000', margin: '0.5rem 0' }}><strong>Items:</strong> {receiptData.items.length}</p>
            <details style={{ marginTop: '0.5rem', color: '#000000' }}>
              <summary style={{ color: '#000000', cursor: 'pointer' }}>View Details</summary>
              <pre style={{ marginTop: '0.5rem', fontSize: '0.9rem', overflow: 'auto', color: '#000000', background: '#ffffff', padding: '0.5rem', borderRadius: '4px' }}>
                {JSON.stringify(receiptData, null, 2)}
              </pre>
            </details>
          </div>
        )}
      </div>
    </div>
  )
}

