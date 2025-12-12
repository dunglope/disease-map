document.getElementById('msgForm').onsubmit = async e => {
    e.preventDefault();
    const input = document.getElementById('messageInput');
    const msg = input.value.trim();
    if (!msg) return;
    const dataset = document.querySelector('input[name="dataset"]').value;
    const replyToId = document.getElementById('replyToInput').value;
    const csrfToken = document.querySelector('[name=csrfmiddlewaretoken]').value;
    await fetch('/api/post-message/', {
        method: 'POST',
        body: new URLSearchParams({
            message: msg, 
            dataset: dataset,
            reply_to: replyToId
        }),
        headers: {'X-CSRFToken': csrfToken}
    });
    input.value = '';
    document.getElementById('replyToInput').value = '';
    document.getElementById('replyIndicator').style.display = 'none';
    loadMessages();
};

document.getElementById('cancelReplyBtn').onclick = () => {
    document.getElementById('replyToInput').value = '';
    document.getElementById('replyIndicator').style.display = 'none';
};

function attachReplyListeners() {
    document.querySelectorAll('.reply-btn').forEach(btn => {
        btn.onclick = e => {
            e.preventDefault();
            const msgId = btn.dataset.msgId;
            const msgName = btn.dataset.msgName;
            document.getElementById('replyToInput').value = msgId;
            document.getElementById('replyName').textContent = msgName;
            document.getElementById('replyIndicator').style.display = 'block';
            document.getElementById('messageInput').focus();
        };
    });
}

function loadMessages() {
    const dataset = new URLSearchParams(window.location.search).get('dataset') || 'general';
    const discussionUrl = document.querySelector('[data-discussion-url]').dataset.discussionUrl;
    fetch(`${discussionUrl}?dataset=${dataset}`)
        .then(r => r.text())
        .then(html => {
            const parser = new DOMParser();
            const doc = parser.parseFromString(html, 'text/html');
            document.getElementById('chatArea').innerHTML = 
                doc.getElementById('chatArea').innerHTML;
            attachReplyListeners();
            document.getElementById('chatArea').scrollTop = document.getElementById('chatArea').scrollHeight;
        });
}

setInterval(loadMessages, 4000);
loadMessages();
