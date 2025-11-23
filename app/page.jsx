'use client'

import { useRef, useState } from 'react'
import SplitBillModal from './components/SplitBillModal'
import './page.css'

export default function Home() {
  const fileInputRef = useRef(null)
  const [isDragging, setIsDragging] = useState(false)
  const [selectedFile, setSelectedFile] = useState(null)
  const [isLoading, setIsLoading] = useState(false)
  const [receiptData, setReceiptData] = useState(null)
  const [error, setError] = useState(null)
  const [selectedItems, setSelectedItems] = useState([])
  const [isSplitModalOpen, setIsSplitModalOpen] = useState(false)

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
      setSelectedItems([]) // Reset selected items when new receipt is loaded
      console.log('Receipt parsed successfully:', data)
    } catch (err) {
      setError(err.message || 'An error occurred while processing the receipt')
      console.error('Error:', err)
    } finally {
      setIsLoading(false)
    }
  }

  // Expand items with quantity > 1 into individual items
  const expandItems = (items) => {
    const expandedItems = []
    items.forEach((item, originalIndex) => {
      const quantity = item.quantity || 1
      const itemTotal = item.total || item.subtotal || 0
      const itemSubtotal = item.subtotal || (itemTotal / quantity)
      const itemTax = item.tax_amount || 0
      const itemTaxPerUnit = itemTax / quantity
      const itemTotalPerUnit = itemTotal / quantity
      
      // Create individual items for each quantity
      for (let i = 0; i < quantity; i++) {
        expandedItems.push({
          ...item,
          quantity: 1,
          subtotal: itemSubtotal / quantity,
          tax_amount: itemTaxPerUnit,
          total: itemTotalPerUnit,
          originalIndex,
          itemInstance: i + 1, // Track which instance this is (1, 2, 3, etc.)
          uniqueId: `${originalIndex}-${i}` // Unique identifier for selection
        })
      }
    })
    return expandedItems
  }

  const handleItemToggle = (item) => {
    setSelectedItems(prev => {
      const isSelected = prev.some(selected => 
        selected.uniqueId === item.uniqueId
      )
      if (isSelected) {
        return prev.filter(selected => selected.uniqueId !== item.uniqueId)
      } else {
        return [...prev, item]
      }
    })
  }

  const handleSplitBill = () => {
    if (selectedItems.length === 0) {
      alert('Please select at least one item to split')
      return
    }
    setIsSplitModalOpen(true)
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
          <div className="error-message" style={{ marginTop: '1rem', color: '#FF5E54', padding: '0.5rem', background: 'rgba(255, 255, 255, 0.7)', borderRadius: '8px', border: '2px solid #FF5E54' }}>
            Error: {error}
          </div>
        )}
        
        {receiptData && (
          <div className="receipt-result" style={{ marginTop: '2rem', padding: '1.5rem', background: 'rgba(255, 255, 255, 0.9)', borderRadius: '12px', color: '#FF5E54', boxShadow: '0 2px 8px rgba(255, 94, 84, 0.3)', border: '3px solid #FF5E54' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h3 style={{ color: '#FF5E54', margin: 0, fontSize: '1.5rem' }}>Receipt Items</h3>
              {selectedItems.length > 0 && (
                <button
                  onClick={handleSplitBill}
                  style={{
                    padding: '0.75rem 1.5rem',
                    background: '#FF5E54',
                    color: '#FFFFFF',
                    border: '2px solid #FF5E54',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    fontWeight: '600',
                    fontSize: '0.95rem',
                    boxShadow: '0 2px 4px rgba(0, 0, 0, 0.2)'
                  }}
                >
                  Split Bill ({selectedItems.length} {selectedItems.length === 1 ? 'item' : 'items'})
                </button>
              )}
            </div>
            
            {receiptData.items && receiptData.items.length > 0 ? (
              <div className="items-list-container" style={{ marginBottom: '1rem' }}>
                {(() => {
                  const expandedItems = expandItems(receiptData.items)
                  return expandedItems.map((item, index) => {
                    const isSelected = selectedItems.some(selected => 
                      selected.uniqueId === item.uniqueId
                    )
                    const originalQuantity = receiptData.items[item.originalIndex]?.quantity || 1
                    const showQuantityLabel = originalQuantity > 1
                    
                    return (
                      <div
                        key={item.uniqueId || index}
                        onClick={() => handleItemToggle(item)}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          padding: '1rem',
                          marginBottom: '0.75rem',
                          background: isSelected ? 'rgba(255, 94, 84, 0.2)' : 'rgba(255, 255, 255, 0.5)',
                          border: `3px solid ${isSelected ? '#FF5E54' : '#FF5E54'}`,
                          borderRadius: '8px',
                          cursor: 'pointer',
                          transition: 'all 0.2s ease'
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => handleItemToggle(item)}
                          onClick={(e) => e.stopPropagation()}
                          style={{ marginRight: '1rem', width: '20px', height: '20px', cursor: 'pointer', accentColor: '#FF5E54' }}
                        />
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: '500', color: '#FF5E54', marginBottom: '0.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <span>{item.item_name || item.name || 'Item'}</span>
                            {showQuantityLabel && (
                              <span style={{ 
                                fontSize: '0.75rem', 
                                color: '#FF5E54', 
                                background: 'rgba(255, 94, 84, 0.1)', 
                                padding: '0.25rem 0.5rem', 
                                borderRadius: '4px',
                                fontWeight: 'normal'
                              }}>
                                {item.itemInstance} of {originalQuantity}
                              </span>
                            )}
                          </div>
                          <div style={{ fontSize: '0.9rem', color: '#FF5E54', opacity: 0.8 }}>
                            {item.subtotal && `Subtotal: $${item.subtotal.toFixed(2)}`}
                            {item.tax_amount > 0 && ` • Tax: $${item.tax_amount.toFixed(2)}`}
                          </div>
                        </div>
                        <div style={{ fontWeight: '600', color: '#FF5E54', fontSize: '1.1rem' }}>
                          ${(item.total || item.subtotal || 0).toFixed(2)}
                        </div>
                      </div>
                    )
                  })
                })()}
              </div>
            ) : (
              <p style={{ color: '#FF5E54', margin: '1rem 0' }}>No items found in receipt</p>
            )}
            
            <div style={{ 
              paddingTop: '1rem', 
              borderTop: '3px solid #FF5E54', 
              display: 'flex', 
              justifyContent: 'space-between',
              alignItems: 'center'
            }}>
              <div>
                <p style={{ color: '#FF5E54', margin: '0.25rem 0', fontSize: '0.9rem' }}>
                  {selectedItems.length} of {(() => {
                    const expandedItems = expandItems(receiptData.items || [])
                    return expandedItems.length
                  })()} items selected
                </p>
              </div>
              <div style={{ textAlign: 'right' }}>
                <p style={{ color: '#FF5E54', margin: '0.25rem 0', fontSize: '0.9rem' }}>
                  <strong>Receipt Total:</strong>
                </p>
                <p style={{ color: '#FF5E54', margin: 0, fontSize: '1.5rem', fontWeight: '700' }}>
                  ${receiptData.total.toFixed(2)}
                </p>
              </div>
            </div>
          </div>
        )}

        <SplitBillModal
          isOpen={isSplitModalOpen}
          onClose={() => setIsSplitModalOpen(false)}
          selectedItems={selectedItems}
          receiptTotal={receiptData?.total || 0}
        />
      </div>
    </div>
  )
}

