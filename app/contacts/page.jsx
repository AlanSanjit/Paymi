'use client'

import './page.css'

export default function ContactsPage() {
  // Mock data for demonstration
  const contacts = [
    { id: 1, name: 'Alex Johnson', amount: 45.50, type: 'owes' },
    { id: 2, name: 'Sarah Chen', amount: 23.75, type: 'owed' },
    { id: 3, name: 'Mike Rodriguez', amount: 12.00, type: 'owes' },
    { id: 4, name: 'Emma Wilson', amount: 67.25, type: 'owed' },
  ]

  const owesMe = contacts.filter((c) => c.type === 'owes')
  const iOwe = contacts.filter((c) => c.type === 'owed')

  return (
    <div className="contacts-page">
      <div className="contacts-container">
        <h1 className="contacts-title">Contacts</h1>

        {owesMe.length > 0 && (
          <section className="contacts-section">
            <h2 className="section-title owes-title">
              Owes Me <span className="count-badge">{owesMe.length}</span>
            </h2>
            <div className="contacts-list">
              {owesMe.map((contact) => (
                <div key={contact.id} className="contact-card owes-card">
                  <div className="contact-info">
                    <div className="contact-avatar">
                      {contact.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="contact-details">
                      <h3 className="contact-name">{contact.name}</h3>
                      <p className="contact-amount owes-amount">
                        ${contact.amount.toFixed(2)}
                      </p>
                    </div>
                  </div>
                  <button className="contact-action-btn">Request</button>
                </div>
              ))}
            </div>
          </section>
        )}

        {iOwe.length > 0 && (
          <section className="contacts-section">
            <h2 className="section-title owed-title">
              I Owe <span className="count-badge">{iOwe.length}</span>
            </h2>
            <div className="contacts-list">
              {iOwe.map((contact) => (
                <div key={contact.id} className="contact-card owed-card">
                  <div className="contact-info">
                    <div className="contact-avatar">
                      {contact.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="contact-details">
                      <h3 className="contact-name">{contact.name}</h3>
                      <p className="contact-amount owed-amount">
                        ${contact.amount.toFixed(2)}
                      </p>
                    </div>
                  </div>
                  <button className="contact-action-btn pay-btn">Pay</button>
                </div>
              ))}
            </div>
          </section>
        )}

        {contacts.length === 0 && (
          <div className="empty-state">
            <div className="empty-icon">👥</div>
            <h2>No contacts yet</h2>
            <p>Start splitting receipts to see your contacts here</p>
          </div>
        )}
      </div>
    </div>
  )
}

