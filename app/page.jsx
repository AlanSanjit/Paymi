'use client'

import { useRef, useState } from 'react'
import './page.css'

export default function Home() {
  const fileInputRef = useRef(null)
  const [isDragging, setIsDragging] = useState(false)
  const [selectedFile, setSelectedFile] = useState(null)

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

  const handleSubmit = () => {
    if (selectedFile) {
      // TODO: Process the file/receipt
      console.log('Submitting file:', selectedFile.name)
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
          disabled={!selectedFile}
        >
          Submit
        </button>
      </div>
    </div>
  )
}

