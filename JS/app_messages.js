export function createMessagesController({
  supabase,
  state,
  getCurrentUserInitials,
  getCurrentUserId,
  getRowTitleField,
  navigateToMessageSource,
  render,
}) {
  const MOCK_MESSAGES = [
    { id: 'mock-1', from: 'AC', to: 'DE', subject: 'Kolla offert', body: 'Kan du titta på offertunderlaget innan vi går vidare?', sourceTable: 'CDM PROJECTS', sourceTitle: 'Exempelprojekt A', createdAt: 'Idag 09:14', unread: true },
    { id: 'mock-2', from: 'MJ', to: 'DE', subject: 'B2B-ready', body: 'Jag tror att metafälten är klara, men packshot behöver dubbelkollas.', sourceTable: 'DIG PROD', sourceTitle: 'Produkt X', createdAt: 'Igår 15:40', unread: true },
    { id: 'mock-3', from: 'KL', to: 'DE', subject: 'PO beslut', body: 'Pris och leveransvillkor är uppdaterade.', sourceTable: 'SÄLJINTRO', sourceTitle: 'Produkt Y', createdAt: 'Mån 11:02', unread: false },
  ];

  function getUsers() {
    return Array.isArray(state.planningUsers) ? state.planningUsers : [];
  }

  function getUserById(id) {
    const value = String(id || '').trim();
    return getUsers().find((user) => String(user.id || '').trim() === value) || null;
  }

  function getUserByInitials(initials) {
    const value = String(initials || '').trim().toUpperCase();
    return getUsers().find((user) => String(user.initials || '').trim().toUpperCase() === value) || null;
  }

  function getInitialsForUserId(id) {
    return getUserById(id)?.initials || '?';
  }

  function getCurrentUser() {
    const id = getCurrentUserId?.();
    return getUserById(id) || getUserByInitials(getCurrentUserInitials?.()) || null;
  }

  function formatMessageTime(value) {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value || '');
    const now = new Date();
    const sameDay = date.toDateString() === now.toDateString();

    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    const isYesterday = date.toDateString() === yesterday.toDateString();

    const time = date.toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' });
    if (sameDay) return `Idag ${time}`;
    if (isYesterday) return `Igår ${time}`;
    return `${date.toLocaleDateString('sv-SE', { month: 'short', day: 'numeric' })} ${time}`;
  }

  function ensureMessagesState() {
    if (!Array.isArray(state.messagesList)) state.messagesList = [];
    if (!state.messagesPanelMode) state.messagesPanelMode = 'inbox';
    if (typeof state.messagesSending !== 'boolean') state.messagesSending = false;
    if (typeof state.messagesLoading !== 'boolean') state.messagesLoading = false;
    if (state.expandedMessageId === undefined) state.expandedMessageId = null;
    if (!state.messageComposeDraft) {
      state.messageComposeDraft = { to: [], subject: '', body: '', sourceTable: '', sourceRowId: '', sourceTitle: '' };
    }
  }

  function normalizeRecipientRow(row) {
    const message = row.planning_messages || row.message || row.message_id || {};
    const fromInitials = getInitialsForUserId(message.from_user_id);
    const toInitials = getCurrentUserInitials?.() || getCurrentUser()?.initials || '?';

    return {
      id: row.id ? `recipient-${row.id}` : `message-${message.id}`,
      __recipientId: row.id,
      __messageId: message.id,
      from: fromInitials,
      to: toInitials,
      subject: message.subject || 'Utan ämne',
      body: message.body || '',
      sourceTable: message.source_table || '',
      sourceRowId: message.source_row_id || '',
      sourceTitle: message.source_title || '',
      createdAt: formatMessageTime(message.created_at),
      unread: row.is_read === false,
      sent: false,
      db: true,
    };
  }

  function normalizeSentMessage(row, recipientRows = []) {
    const fromInitials = getInitialsForUserId(row.from_user_id) || getCurrentUserInitials?.() || '?';
    const recipients = recipientRows
      .filter((item) => String(item.message_id) === String(row.id))
      .map((item) => getInitialsForUserId(item.user_id))
      .filter(Boolean);

    return {
      id: `sent-${row.id}`,
      __messageId: row.id,
      from: fromInitials,
      to: recipients.length ? recipients.join(', ') : '?',
      subject: row.subject || 'Utan ämne',
      body: row.body || '',
      sourceTable: row.source_table || '',
      sourceRowId: row.source_row_id || '',
      sourceTitle: row.source_title || '',
      createdAt: formatMessageTime(row.created_at),
      unread: false,
      sent: true,
      db: true,
    };
  }

  async function loadMessages() {
    ensureMessagesState();

    const currentUserId = String(getCurrentUserId?.() || '').trim();
    if (!currentUserId) {
      state.messagesList = [...MOCK_MESSAGES];
      return;
    }

    state.messagesLoading = true;

    try {
      const { data: recipientRows, error: recipientError } = await supabase
        .from('planning_message_recipients')
        .select('id,message_id,user_id,is_read,read_at,archived,planning_messages(id,created_at,updated_at,from_user_id,subject,body,source_table,source_row_id,source_title,is_system)')
        .eq('user_id', currentUserId)
        .eq('archived', false)
        .order('created_at', { referencedTable: 'planning_messages', ascending: false });

      if (recipientError) throw recipientError;

      const received = (Array.isArray(recipientRows) ? recipientRows : [])
        .filter((row) => row.planning_messages)
        .map(normalizeRecipientRow);

      let sent = [];
      const { data: sentMessages, error: sentError } = await supabase
        .from('planning_messages')
        .select('id,created_at,updated_at,from_user_id,subject,body,source_table,source_row_id,source_title,is_system')
        .eq('from_user_id', currentUserId)
        .order('created_at', { ascending: false })
        .limit(20);

      if (!sentError && Array.isArray(sentMessages) && sentMessages.length) {
        const ids = sentMessages.map((item) => item.id).filter(Boolean);
        let sentRecipientRows = [];
        if (ids.length) {
          const { data } = await supabase
            .from('planning_message_recipients')
            .select('message_id,user_id')
            .in('message_id', ids);
          sentRecipientRows = Array.isArray(data) ? data : [];
        }
        sent = sentMessages.map((item) => normalizeSentMessage(item, sentRecipientRows));
      }

      const combined = [...received, ...sent];
      combined.sort((a, b) => Number(!!b.unread) - Number(!!a.unread));

      state.messagesList = combined;
      state.messagesDbReady = true;
    } catch (err) {
      console.warn('Could not load DB messages, falling back to mock messages:', err.message);
      state.messagesList = [...MOCK_MESSAGES];
      state.messagesDbReady = false;
    } finally {
      state.messagesLoading = false;
    }
  }

  function getUnreadMessageCount() {
    ensureMessagesState();
    return state.messagesList.filter((item) => item.unread).length;
  }

  function closeMessagesPanel() {
    state.messagesPanelOpen = false;
    state.messagesPanelMode = 'inbox';
    state.messageComposeDraft = { to: [], subject: '', body: '', sourceTable: '', sourceRowId: '', sourceTitle: '' };
    render();
  }

  async function openMessagesPanel() {
    ensureMessagesState();
    state.messagesPanelOpen = true;
    state.messagesPanelMode = 'inbox';
    state.settingsPanelOpen = false;
    state.linksPanelOpen = false;
    state.archivePanelOpen = false;
    state.notesPanelOpen = false;
    state.rowTodoPanelOpen = false;
    state.columnChecklistPanelOpen = false;
    state.detailRowId = null;
    state.newRowDraft = null;
    await loadMessages();
    render();
  }

  function openMessageCompose(context = {}) {
    ensureMessagesState();
    const sourceTitle = String(context.sourceTitle || '').trim();
    const sourceTable = String(context.sourceTable || '').trim();

    state.messagesPanelOpen = true;
    state.messagesPanelMode = 'compose';
    state.messageComposeDraft = {
      to: [],
      subject: sourceTitle ? `Fråga om ${sourceTitle}` : '',
      body: '',
      sourceTable,
      sourceRowId: context.sourceRowId || '',
      sourceTitle,
    };

    state.settingsPanelOpen = false;
    state.linksPanelOpen = false;
    state.archivePanelOpen = false;
    state.notesPanelOpen = false;
    state.rowTodoPanelOpen = false;
    state.columnChecklistPanelOpen = false;
    state.detailRowId = null;
    state.newRowDraft = null;
    render();
  }

  function openReplyCompose(item) {
    ensureMessagesState();
    const ownInitials = getCurrentUserInitials?.() || '';
    const replyTo = String(item?.from || '').trim();
    const originalSubject = String(item?.subject || '').trim();
    const subject = originalSubject.toLowerCase().startsWith('re:')
      ? originalSubject
      : `Re: ${originalSubject || 'Meddelande'}`;

    state.messagesPanelOpen = true;
    state.messagesPanelMode = 'compose';
    state.messageComposeDraft = {
      to: replyTo && replyTo !== ownInitials ? [replyTo] : [],
      subject,
      body: '',
      sourceTable: item?.sourceTable || '',
      sourceRowId: item?.sourceRowId || '',
      sourceTitle: item?.sourceTitle || '',
    };
    render();
  }

  async function openMessageInline(messageId) {
    ensureMessagesState();
    const id = String(messageId);
    const current = state.messagesList.find((item) => String(item.id) === id);

    state.expandedMessageId = String(state.expandedMessageId) === id ? null : id;

    if (current?.unread) {
      state.messagesList = state.messagesList.map((item) =>
        String(item.id) === id ? { ...item, unread: false } : item
      );

      // Optimistic UI: update badge/list immediately, then sync read-state to DB.
      render();

      if (current.__recipientId) {
        const { error } = await supabase
          .from('planning_message_recipients')
          .update({ is_read: true, read_at: new Date().toISOString() })
          .eq('id', current.__recipientId);

        if (error) console.warn('Could not mark message as read:', error.message);
      }
      return;
    }

    render();
  }

  function getSelectedRecipients() {
    const draft = state.messageComposeDraft || {};
    if (Array.isArray(draft.to)) return draft.to.map((item) => String(item || '').trim()).filter(Boolean);
    return String(draft.to || '').split(',').map((item) => item.trim()).filter(Boolean);
  }

  async function sendMessage() {
    ensureMessagesState();
    if (state.messagesSending) return;

    const draft = state.messageComposeDraft || {};
    const recipients = getSelectedRecipients();
    const subject = String(draft.subject || '').trim();
    const body = String(draft.body || '').trim();
    const senderId = String(getCurrentUserId?.() || '').trim();

    if (!senderId) return alert('Avsändare saknas.');
    if (!recipients.length) return alert('Välj minst en mottagare.');
    if (!subject) return alert('Ange ämne.');
    if (!body) return alert('Skriv ett meddelande.');

    const recipientUsers = recipients
      .map((initials) => getUserByInitials(initials))
      .filter(Boolean);

    if (!recipientUsers.length) return alert('Kunde inte hitta mottagare i planning_users.');

    state.messagesSending = true;
    render();

    try {
      const { data: message, error: messageError } = await supabase
        .from('planning_messages')
        .insert({
          from_user_id: senderId,
          subject,
          body,
          source_table: draft.sourceTable || null,
          source_row_id: draft.sourceRowId ? String(draft.sourceRowId) : null,
          source_title: draft.sourceTitle || null,
          is_system: false,
        })
        .select('id')
        .single();

      if (messageError) throw messageError;

      const recipientPayload = recipientUsers.map((user) => ({
        message_id: message.id,
        user_id: user.id,
        is_read: false,
        archived: false,
      }));

      const { error: recipientsError } = await supabase
        .from('planning_message_recipients')
        .insert(recipientPayload);

      if (recipientsError) throw recipientsError;

      state.messagesPanelMode = 'inbox';
      state.messageComposeDraft = { to: [], subject: '', body: '', sourceTable: '', sourceRowId: '', sourceTitle: '' };
      await loadMessages();
    } catch (err) {
      alert(`Kunde inte skicka meddelande: ${err.message}`);
    } finally {
      state.messagesSending = false;
      render();
    }
  }

  function createMessagesButton() {
    document.querySelectorAll('[data-links-button="true"], .links-button').forEach((button) => button.remove());
    ensureMessagesState();
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'messages-button';
    button.textContent = 'MSG';

    const unreadCount = getUnreadMessageCount();
    if (unreadCount > 0) {
      const badge = document.createElement('span');
      badge.className = 'messages-button__badge';
      badge.textContent = String(unreadCount);
      button.appendChild(badge);
    }

    button.addEventListener('click', openMessagesPanel);
    return button;
  }

  function ensureMessagesButton(userArea, settingsButton) {
    ensureMessagesState();

    const targetArea =
      userArea ||
      settingsButton?.parentElement ||
      document.querySelector('.topbar__user') ||
      document.querySelector('.topbar');

    if (!targetArea) return;

    const current = targetArea.querySelector('[data-messages-button="true"]');
    const button = createMessagesButton();
    button.dataset.messagesButton = 'true';

    if (current) {
      current.replaceWith(button);
      return;
    }

    if (settingsButton && settingsButton.parentElement === targetArea) {
      targetArea.insertBefore(button, settingsButton);
    } else {
      targetArea.appendChild(button);
    }
  }

  function createMessageCard(item) {
    const isExpanded = String(state.expandedMessageId || '') === String(item.id);
    const card = document.createElement('article');
    card.className = `message-card message-card--compact${item.unread ? ' is-unread' : ''}${isExpanded ? ' is-expanded' : ''}`;

    const top = document.createElement('button');
    top.type = 'button';
    top.className = 'message-card__top message-card__top-button';
    top.addEventListener('click', () => openMessageInline(item.id));

    const unreadMark = document.createElement('span');
    unreadMark.className = 'message-card__unread-mark';
    unreadMark.textContent = item.unread ? '●' : '';

    const title = document.createElement('span');
    title.className = 'message-card__title';
    title.textContent = item.subject || 'Utan ämne';

    const meta = document.createElement('span');
    meta.className = 'message-card__meta message-card__meta--header';
    meta.textContent = `${item.from || '?'} → ${item.to || '?'} · ${item.createdAt || ''}`;

    const chevron = document.createElement('span');
    chevron.className = 'message-card__chevron';
    chevron.textContent = isExpanded ? '−' : '+';

    top.appendChild(unreadMark);
    top.appendChild(title);
    top.appendChild(meta);
    top.appendChild(chevron);
    card.appendChild(top);

    if (!isExpanded) return card;

    const content = document.createElement('div');
    content.className = 'message-card__expanded';

    const context = document.createElement('div');
    context.className = 'message-card__context';

    if (item.sourceTable) {
      const tableSpan = document.createElement('span');
      tableSpan.textContent = `${item.sourceTable}${item.sourceTitle ? ' · ' : ''}`;
      context.appendChild(tableSpan);

      if (item.sourceTitle) {
        const rowLink = document.createElement('button');
        rowLink.type = 'button';
        rowLink.className = 'message-card__row-link';
        rowLink.textContent = item.sourceTitle;
        rowLink.title = 'Gå till rad';
        rowLink.addEventListener('click', (event) => {
          event.preventDefault();
          event.stopPropagation();

          if (typeof navigateToMessageSource === 'function') {
            navigateToMessageSource(item);
          }
        });
        context.appendChild(rowLink);
      }
    }

    const body = document.createElement('p');
    body.className = 'message-card__body';
    body.textContent = item.body || '';

    const actions = document.createElement('div');
    actions.className = 'message-card__actions message-card__actions--expanded';

    const replyButton = document.createElement('button');
    replyButton.type = 'button';
    replyButton.className = 'secondary-button';
    replyButton.textContent = 'Svara';
    replyButton.addEventListener('click', () => openReplyCompose(item));
    actions.appendChild(replyButton);

    if (context.childNodes.length || context.textContent) content.appendChild(context);
    content.appendChild(body);
    content.appendChild(actions);
    card.appendChild(content);

    return card;
  }

  function createComposeForm() {
    const draft = state.messageComposeDraft || {};
    const users = getUsers();
    const formCard = document.createElement('section');
    formCard.className = 'detail-card message-compose settings-form';

    const title = document.createElement('h3');
    title.className = 'detail-card__title';
    title.textContent = 'Nytt meddelande';

    const recipientField = document.createElement('div');
    recipientField.className = 'detail-field';
    const recipientLabel = document.createElement('span');
    recipientLabel.className = 'detail-field__label';
    recipientLabel.textContent = 'Till';

    const selectedRecipients = Array.isArray(draft.to)
      ? draft.to
      : String(draft.to || '').split(',').map((item) => item.trim()).filter(Boolean);

    const recipientList = document.createElement('div');
    recipientList.className = 'message-recipient-list';

    users
      .filter((user) => String(user.initials || '').trim())
      .forEach((user) => {
        const initials = String(user.initials || '').trim();

        const optionLabel = document.createElement('label');
        optionLabel.className = 'message-recipient-option';

        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.value = initials;
        checkbox.checked = selectedRecipients.includes(initials);
        checkbox.addEventListener('change', () => {
          const current = new Set(getSelectedRecipients());
          checkbox.checked ? current.add(initials) : current.delete(initials);
          state.messageComposeDraft.to = Array.from(current);
        });

        const text = document.createElement('span');
        text.textContent = initials;

        optionLabel.appendChild(checkbox);
        optionLabel.appendChild(text);
        recipientList.appendChild(optionLabel);
      });

    recipientField.appendChild(recipientLabel);
    recipientField.appendChild(recipientList);

    const subjectField = document.createElement('label');
    subjectField.className = 'detail-field';
    const subjectLabel = document.createElement('span');
    subjectLabel.className = 'detail-field__label';
    subjectLabel.textContent = 'Ämne';
    const subjectInput = document.createElement('input');
    subjectInput.className = 'detail-field__control';
    subjectInput.type = 'text';
    subjectInput.value = draft.subject || '';
    subjectInput.addEventListener('input', () => {
      state.messageComposeDraft.subject = subjectInput.value;
    });
    subjectField.appendChild(subjectLabel);
    subjectField.appendChild(subjectInput);

    const context = document.createElement('div');
    context.className = 'message-compose__context';
    context.textContent = draft.sourceTable
      ? `Koppling: ${draft.sourceTable}${draft.sourceTitle ? ` · ${draft.sourceTitle}` : ''}`
      : 'Ingen rad kopplad';

    const bodyField = document.createElement('label');
    bodyField.className = 'detail-field';
    const bodyLabel = document.createElement('span');
    bodyLabel.className = 'detail-field__label';
    bodyLabel.textContent = 'Meddelande';
    const bodyInput = document.createElement('textarea');
    bodyInput.className = 'detail-field__control notes-form__body todo-modal__textarea';
    bodyInput.rows = 7;
    bodyInput.value = draft.body || '';
    bodyInput.addEventListener('input', () => {
      state.messageComposeDraft.body = bodyInput.value;
    });
    bodyField.appendChild(bodyLabel);
    bodyField.appendChild(bodyInput);

    const footer = document.createElement('div');
    footer.className = 'side-panel__footer';

    const sendButton = document.createElement('button');
    sendButton.type = 'button';
    sendButton.className = 'primary-button';
    sendButton.textContent = state.messagesSending ? 'Skickar...' : 'Skicka';
    sendButton.disabled = !!state.messagesSending;
    sendButton.addEventListener('click', sendMessage);

    const cancelButton = document.createElement('button');
    cancelButton.type = 'button';
    cancelButton.className = 'secondary-button';
    cancelButton.textContent = 'Avbryt';
    cancelButton.addEventListener('click', () => {
      state.messagesPanelMode = 'inbox';
      render();
    });

    footer.appendChild(sendButton);
    footer.appendChild(cancelButton);

    formCard.appendChild(title);
    formCard.appendChild(recipientField);
    formCard.appendChild(subjectField);
    formCard.appendChild(context);
    formCard.appendChild(bodyField);
    formCard.appendChild(footer);
    return formCard;
  }

  function createMessagesPanel() {
    ensureMessagesState();
    const overlay = document.createElement('div');
    overlay.className = 'overlay-modal';

    const dialog = document.createElement('aside');
    dialog.className = 'side-panel overlay-modal__dialog messages-panel';

    const header = document.createElement('div');
    header.className = 'side-panel__header';

    const heading = document.createElement('div');
    const unreadCount = getUnreadMessageCount();
    heading.innerHTML = `
      <p class="side-panel__eyebrow">${state.messagesDbReady === false ? 'Fallback mock' : 'Meddelanden'}</p>
      <h2 class="side-panel__title">MSG${unreadCount ? ` (${unreadCount})` : ''}</h2>
      <p class="side-panel__text">${state.messagesDbReady === false ? 'DB kunde inte läsas - visar mockdata.' : 'Klicka på en rubrik för att läsa och markera som läst.'}</p>
    `;

    const headerActions = document.createElement('div');
    headerActions.className = 'side-panel__header-actions';

    const newButton = document.createElement('button');
    newButton.type = 'button';
    newButton.className = 'secondary-button';
    newButton.textContent = 'Nytt';
    newButton.addEventListener('click', () => {
      state.messagesPanelMode = 'compose';
      state.messageComposeDraft = { to: [], subject: '', body: '', sourceTable: '', sourceRowId: '', sourceTitle: '' };
      render();
    });

    const closeButton = document.createElement('button');
    closeButton.type = 'button';
    closeButton.className = 'side-panel__close side-panel__close--small';
    closeButton.textContent = '×';
    closeButton.setAttribute('aria-label', 'Stäng');
    closeButton.addEventListener('click', closeMessagesPanel);

    headerActions.appendChild(newButton);
    header.appendChild(heading);
    header.appendChild(headerActions);
    header.appendChild(closeButton);

    const body = document.createElement('div');
    body.className = 'side-panel__body';

    if (state.messagesLoading) {
      const loading = document.createElement('p');
      loading.className = 'empty-state';
      loading.textContent = 'Laddar meddelanden...';
      body.appendChild(loading);
    } else if (state.messagesPanelMode === 'compose') {
      body.appendChild(createComposeForm());
    } else {
      const list = document.createElement('div');
      list.className = 'messages-list';

      const unreadRows = state.messagesList.filter((item) => item.unread);
      const previousRows = state.messagesList.filter((item) => !item.unread);

      const appendSection = (title, rows) => {
        const section = document.createElement('section');
        section.className = 'messages-section';

        const sectionTitle = document.createElement('h3');
        sectionTitle.className = 'messages-section__title';
        sectionTitle.textContent = title;
        section.appendChild(sectionTitle);

        if (!rows.length) {
          const empty = document.createElement('p');
          empty.className = 'messages-section__empty';
          empty.textContent = title === 'Olästa' ? 'Inga olästa meddelanden.' : 'Inga tidigare meddelanden.';
          section.appendChild(empty);
        } else {
          rows.forEach((item) => section.appendChild(createMessageCard(item)));
        }

        list.appendChild(section);
      };

      appendSection('Olästa', unreadRows);
      appendSection('Tidigare', previousRows);
      body.appendChild(list);
    }

    dialog.appendChild(header);
    dialog.appendChild(body);
    overlay.appendChild(dialog);
    return overlay;
  }

  function createMessageButtonForRow(tableName, row) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'secondary-button';
    button.textContent = 'Meddela';
    button.addEventListener('click', () => {
      const titleField = getRowTitleField(tableName);
      openMessageCompose({
        sourceTable: tableName,
        sourceRowId: row?.id || '',
        sourceTitle: row?.[titleField] || '',
      });
    });
    return button;
  }

  return {
    ensureMessagesButton,
    createMessagesPanel,
    createMessageButtonForRow,
    openMessageCompose,
    openMessagesPanel,
    loadMessages,
    getUnreadMessageCount,
  };
}
