import { useState, useEffect, useLayoutEffect, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { 
  AlertTriangle,
  ArrowLeft,
  Download, 
  ImagePlus, 
  MessageCircle, 
  Send, 
  Smile, 
  X, 
  FileText, 
  Trash2, 
  CheckCheck, 
  Ban, 
  Copy, 
  Share2, 
  Users, 
  CornerUpRight,
  CheckSquare,
  Check,
  Search,
  Loader2,
  Reply,
  Receipt,
} from 'lucide-react';
import { 
  collection, 
  query, 
  where, 
  onSnapshot, 
  addDoc, 
  setDoc,
  updateDoc, 
  doc, 
  arrayUnion, 
  runTransaction,
  serverTimestamp,
  writeBatch
} from 'firebase/firestore';
import { db } from '../../firebase';
import { triggerPushNotification } from '../../utils/notifications';
import { formatCurrency } from '../../utils/currency';
import { CATEGORIES, PAYMENT_METHODS } from '../../utils/constants';
import { uploadChatMedia } from '../../utils/cloudinaryUpload';
import EmptyState from '../common/EmptyState';

const EMOJI_CATEGORIES = {
  Recent: ['😀', '😂', '🥰', '😍', '😎', '😭', '😅', '🤔', '🙌', '👏', '👍', '👎', '🙏', '❤️', '🔥', '🎉', '✨', '💸', '🍕', '☕', '🏠', '✅', '❌'],
  Smileys: ['😃', '😄', '😁', '😆', '😅','🥹', '😂', '🤣', '🥲', '☺️', '😊', '😇', '🙂', '🙃', '😉', '😌', '😍', '🥰', '😘', '😗', '😙', '😚', '😋', '😛'],
  Gestures: ['👋', '🤚', '🖐️', '✋', '🖖', '👌', '🤌', '🤏', '✌️', '🤞', '🫰', '🤟', '🤘', '🤙', '👈', '👉', '👆', '🖕', '👇', '☝️', '👍', '👎', '✊', '👊'],
  Finance: ['💰', '🪙', '💵', '💶', '💷', '💳', '🧾', '🛒', '🛍️', '📈', '📉', '💸', '🤑', '💎', '🏦', '💹']
};

const STICKER_PACKS = {
  Reactions: ['🥳', '💖', '🫶', '🤝', '💯', '🚀', '🔥', '✨', '🎉', '👏', '🙌', '⭐'],
  'Food & Chill': ['🍕', '🍔', '🍟', '🧋', '☕', '🍰', '🍜', '🍩', '🥑', '🌮', '🍻', '🍿'],
  'Cute Animals': ['🐱', '🐶', '🐼', '🐻', '🐰', '🦊', '🐨', '🐯', '🦁', '🐸', '🐵', '🦄'],
  Money: ['💸', '🤑', '💳', '🧾', '💰', '📉', '📈', '🪙', '💎', '🏦', '⚖️', '🛒']
};

const DEFAULT_TRENDING_GIFS = [
  { id: '1', title: 'Thumbs Up', url: 'https://media.giphy.com/media/111ebonMs90YLu/giphy.gif' },
  { id: '2', title: 'Money Rain', url: 'https://media.giphy.com/media/67ThRZlYBvibtdF9JH/giphy.gif' },
  { id: '3', title: 'Mind Blown', url: 'https://media.giphy.com/media/26ufdipQqU2lhNA4g/giphy.gif' },
  { id: '4', title: 'Celebrate', url: 'https://media.giphy.com/media/artj92V8o75VPL7AeQ/giphy.gif' },
  { id: '5', title: 'Confused', url: 'https://media.giphy.com/media/g01ZnwAUvutuK8GIQn/giphy.gif' },
  { id: '6', title: 'Coffee Time', url: 'https://media.giphy.com/media/oZEBLugoTdzxK/giphy.gif' },
  { id: '7', title: 'Calculating', url: 'https://media.giphy.com/media/BmmfETghGOPrW/giphy.gif' },
  { id: '8', title: 'Deal Done', url: 'https://media.giphy.com/media/l0MYt5jPR6QX5pnqM/giphy.gif' }
];

const GIPHY_API_KEY = 'dc6zaTOxFJmzC'; // Public test key for quick client searches
const QUICK_REACTIONS = ['❤️', '👍', '😂', '😮', '😢', '🙏'];
const MAX_BATCH_MESSAGES = 500;
const TYPING_IDLE_DELAY = 1800;
const TYPING_UPDATE_INTERVAL = 1500;
const TYPING_EXPIRY = 5000;
const LINK_PATTERN = /https?:\/\/[^\s<>{}\x5B\x5D"']+|www\.[^\s<>{}\x5B\x5D"']+|(?<![@\w.-])(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}(?::\d+)?(?:[/?#][^\s<>{}\x5B\x5D"']*)?/gi;
const TRAILING_LINK_PUNCTUATION = /[.,!?;:)}\]]+$/;
const linkPreviewCache = new Map();

const getTimestamp = () => Date.now();

const extractLinks = (text = '') => {
  const links = [];
  for (const match of text.matchAll(LINK_PATTERN)) {
    const linkText = match[0].replace(TRAILING_LINK_PUNCTUATION, '');
    const url = /^https?:\/\//i.test(linkText) ? linkText : `https://${linkText}`;
    try {
      const parsedUrl = new URL(url);
      if (parsedUrl.protocol === 'http:' || parsedUrl.protocol === 'https:') {
        links.push({ text: linkText, url: parsedUrl.href });
      }
    } catch {
      // Ignore malformed URL text
    }
  }
  return links;
};

const renderLinkedText = (text = '') => {
  const parts = [];
  let lastIndex = 0;
  for (const match of text.matchAll(LINK_PATTERN)) {
    const linkText = match[0].replace(TRAILING_LINK_PUNCTUATION, '');
    if (!linkText) continue;
    const startIndex = match.index;
    const endIndex = startIndex + linkText.length;
    if (startIndex > lastIndex) parts.push(text.slice(lastIndex, startIndex));
    const url = /^https?:\/\//i.test(linkText) ? linkText : `https://${linkText}`;
    try {
      const parsedUrl = new URL(url);
      if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
        parts.push(linkText);
      } else {
        parts.push(
          <a
            key={`${startIndex}-${linkText}`}
            href={parsedUrl.href}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(event) => event.stopPropagation()}
            onMouseDown={(event) => event.stopPropagation()}
            onTouchStart={(event) => event.stopPropagation()}
            onContextMenu={(event) => event.stopPropagation()}
            className="break-all font-semibold underline decoration-current/50 underline-offset-2 hover:decoration-current"
          >
            {linkText}
          </a>
        );
      }
    } catch {
      parts.push(linkText);
    }
    lastIndex = endIndex;
    const punctuation = match[0].slice(linkText.length);
    if (punctuation) {
      parts.push(punctuation);
      lastIndex += punctuation.length;
    }
  }
  if (lastIndex < text.length) parts.push(text.slice(lastIndex));
  return parts;
};

const isOnlyEmojis = (str) => {
  if (!str) return false;
  const trimmed = str.trim();
  const emojiRegex = /^(\p{Extended_Pictographic}|\p{Emoji_Presentation}|\p{Emoji_Modifier_Base}|\uFE0F|\u200D|\s)+$/u;
  if (!emojiRegex.test(trimmed)) return false;
  const characters = Array.from(trimmed.replace(/\s+/g, ''));
  return characters.length >= 1 && characters.length <= 4;
};

function LinkPreview({ url, isMe }) {
  const [preview, setPreview] = useState(() => linkPreviewCache.get(url) || null);

  useEffect(() => {
    const controller = new AbortController();
    const cachedPreview = linkPreviewCache.get(url);
    const previewRequest = cachedPreview
      ? Promise.resolve(cachedPreview)
      : fetch(`/api/link-preview?url=${encodeURIComponent(url)}`, { signal: controller.signal })
        .then(async (response) => {
          if (!response.ok) throw new Error(`Link preview request failed (${response.status}).`);
          return response.json();
        })
        .then((data) => {
          linkPreviewCache.set(url, data);
          return data;
        });

    previewRequest.then(setPreview)
      .catch((error) => {
        if (error.name !== 'AbortError') {
          console.error('Could not load shared link preview:', error);
        }
      });

    return () => controller.abort();
  }, [url]);

  const hostname = new URL(preview?.url || url).hostname;
  const displayPreview = preview || {
    siteName: hostname,
    title: '',
    description: '',
    image: '',
  };

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(event) => event.stopPropagation()}
      onMouseDown={(event) => event.stopPropagation()}
      onTouchStart={(event) => event.stopPropagation()}
      onContextMenu={(event) => event.stopPropagation()}
      className={`mt-2 block max-w-md overflow-hidden rounded-xl border transition-colors ${
        isMe
          ? 'border-white/20 bg-slate-950/10 hover:bg-slate-950/15'
          : 'border-slate-200 bg-slate-50 hover:bg-slate-100'
      }`}
    >
      {displayPreview.image && (
        <img
          src={displayPreview.image}
          alt=""
          loading="lazy"
          className="max-h-48 w-full object-cover"
          onError={(event) => {
            event.currentTarget.style.display = 'none';
          }}
        />
      )}
      <span className="block px-3 py-2">
        <span className={`block truncate text-[10px] font-semibold uppercase tracking-wide ${isMe ? 'text-sky-100/80' : 'text-slate-400'}`}>
          {displayPreview.siteName || hostname}
        </span>
        {displayPreview.title && (
          <span className="mt-0.5 block line-clamp-2 text-xs font-bold">
            {displayPreview.title}
          </span>
        )}
        {displayPreview.description && (
          <span className={`mt-0.5 block line-clamp-2 text-[11px] ${isMe ? 'text-sky-50/80' : 'text-slate-500'}`}>
            {displayPreview.description}
          </span>
        )}
        {!preview && (
          <span className={`mt-0.5 block break-all text-[11px] ${isMe ? 'text-sky-50/80' : 'text-slate-500'}`}>
            {url}
          </span>
        )}
      </span>
    </a>
  );
}

export default function ChatTab({
  group,
  groups = [],
  currentUser,
  users,
  expenses = [],
  onSendNotification,
  onResolveExpenseDispute,
  showToast,
}) {
  const [messages, setMessages] = useState([]);
  const [typingMessages, setTypingMessages] = useState([]);
  const [typingNow, setTypingNow] = useState(0);
  const [input, setInput] = useState('');
  const [replyingTo, setReplyingTo] = useState(null);
  const [pickerTab, setPickerTab] = useState(null);
  const [activeStickerPack, setActiveStickerPack] = useState('Reactions');
  const [activeEmojiCat, setActiveEmojiCat] = useState('Recent');
  const [selectedImage, setSelectedImage] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [attachmentError, setAttachmentError] = useState('');

  // GIF Search State
  const [gifSearchQuery, setGifSearchQuery] = useState('');
  const [gifResults, setGifResults] = useState(DEFAULT_TRENDING_GIFS);
  const [isSearchingGifs, setIsSearchingGifs] = useState(false);

  // Context Menu State
  const [activeContextMenu, setActiveContextMenu] = useState(null);
  const [deleteDialogMessages, setDeleteDialogMessages] = useState(null);
  const [deleteError, setDeleteError] = useState('');
  const [deletingMessage, setDeletingMessage] = useState(false);
  const [shareDialogMessages, setShareDialogMessages] = useState(null);
  const [shareError, setShareError] = useState('');
  const [sharingGroupId, setSharingGroupId] = useState(null);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [resolvingDisputeIds, setResolvingDisputeIds] = useState(new Set());
  const [disputeResolutionMessage, setDisputeResolutionMessage] = useState(null);
  const [disputeResolutionMode, setDisputeResolutionMode] = useState('choices');
  const [disputeEditForm, setDisputeEditForm] = useState(null);
  const [disputeResolutionError, setDisputeResolutionError] = useState('');

  // Multi-Selection Mode
  const [isSelectMode, setIsSelectMode] = useState(false);
  const [selectedMessageIds, setSelectedMessageIds] = useState(new Set());

  const bottomRef = useRef(null);
  const messageFeedRef = useRef(null);
  const messageContentRef = useRef(null);
  const initialAutoScrollRef = useRef(true);
  const fileInputRef = useRef(null);
  const messageInputRef = useRef(null);
  const pressTimerRef = useRef(null);
  const touchStartRef = useRef(null);
  const typingStopTimerRef = useRef(null);
  const typingDocRef = useMemo(
    () => (db && group?.id && currentUser?.id
      ? doc(db, 'messages', `typing-${encodeURIComponent(group.id)}-${encodeURIComponent(currentUser.id)}`)
      : null),
    [group?.id, currentUser?.id]
  );
  const typingWriteQueueRef = useRef(Promise.resolve());
  const typingActiveRef = useRef(false);
  const lastTypingWriteRef = useRef(0);
  const typingErrorShownRef = useRef(false);

  // GIF search fetcher with debouncing
  useEffect(() => {
    if (pickerTab !== 'gif') return;
    
    const queryTerm = gifSearchQuery.trim();
    if (!queryTerm) {
      setGifResults(DEFAULT_TRENDING_GIFS);
      setIsSearchingGifs(false);
      return;
    }

    const timer = setTimeout(async () => {
      setIsSearchingGifs(true);
      try {
        const endpoint = `https://api.giphy.com/v1/gifs/search?api_key=${GIPHY_API_KEY}&q=${encodeURIComponent(queryTerm)}&limit=16&rating=g`;
        const res = await fetch(endpoint);
        const data = await res.json();
        if (data?.data && Array.isArray(data.data)) {
          const parsed = data.data.map(item => ({
            id: item.id,
            title: item.title || 'GIF',
            url: item.images?.downsized_medium?.url || item.images?.fixed_height?.url || item.images?.original?.url
          })).filter(item => Boolean(item.url));
          setGifResults(parsed.length > 0 ? parsed : DEFAULT_TRENDING_GIFS);
        }
      } catch (err) {
        console.warn('GIF search error:', err);
      } finally {
        setIsSearchingGifs(false);
      }
    }, 400);

    return () => clearTimeout(timer);
  }, [gifSearchQuery, pickerTab]);

  const reportTypingError = (error, message) => {
    console.error('Chat typing status error:', error);
    if (typingErrorShownRef.current) return;
    typingErrorShownRef.current = true;
    showToast?.(message, 'error');
  };

  const stopTyping = () => {
    if (typingStopTimerRef.current) {
      clearTimeout(typingStopTimerRef.current);
      typingStopTimerRef.current = null;
    }
    if (!typingActiveRef.current || !typingDocRef) return;

    typingActiveRef.current = false;
    typingWriteQueueRef.current = typingWriteQueueRef.current
      .catch(() => {})
      .then(() => updateDoc(typingDocRef, { typingExpiresAt: 0 }))
      .catch((error) => {
        reportTypingError(error, 'Could not clear typing status.');
      });
  };

  const updateTypingStatus = (text) => {
    if (!text.trim() || !typingDocRef) {
      stopTyping();
      return;
    }

    typingActiveRef.current = true;
    if (typingStopTimerRef.current) clearTimeout(typingStopTimerRef.current);
    typingStopTimerRef.current = setTimeout(stopTyping, TYPING_IDLE_DELAY);

    const now = Date.now();
    if (now - lastTypingWriteRef.current < TYPING_UPDATE_INTERVAL) return;
    lastTypingWriteRef.current = now;

    typingWriteQueueRef.current = typingWriteQueueRef.current
      .catch(() => {})
      .then(() => setDoc(typingDocRef, {
        groupId: group.id,
        senderId: currentUser.id,
        senderName: currentUser.username || 'A roommate',
        type: 'typing',
        typingExpiresAt: Date.now() + TYPING_EXPIRY,
      }))
      .then(() => {
        typingErrorShownRef.current = false;
      })
      .catch((error) => {
        reportTypingError(error, 'Could not share typing status.');
      });
  };

  useEffect(() => () => {
    if (typingStopTimerRef.current) clearTimeout(typingStopTimerRef.current);
    if (typingActiveRef.current && typingDocRef) {
      typingWriteQueueRef.current = typingWriteQueueRef.current
        .catch(() => {})
        .then(() => updateDoc(typingDocRef, { typingExpiresAt: 0 }))
        .catch((error) => {
          console.error('Could not clear typing status:', error);
        });
      typingActiveRef.current = false;
    }
  }, [typingDocRef]);

  const getUser = (userId) => {
    return users.find(u => u.id === userId) || { username: 'Roommate' };
  };

  const getReplySummary = (message) => {
    if (message?.type === 'expense_dispute') {
      return `Expense dispute: ${message.expenseTitle || 'Expense'}`;
    }
    if (message?.text?.trim()) return message.text.trim();
    if (message?.attachmentType === 'image') return 'Photo';
    if (message?.attachmentType === 'gif') return 'GIF';
    if (message?.attachmentType === 'video') return 'Video';
    if (message?.attachmentType === 'audio') return 'Audio';
    if (message?.attachmentName) return message.attachmentName;
    if (message?.type === 'sticker') return 'Sticker';
    return 'Message';
  };

  const createReplyReference = (message) => ({
    id: message.id || '',
    senderId: message.senderId || '',
    senderName: message.senderName || getUser(message.senderId).username,
    text: message.text || '',
    type: message.type || 'text',
    attachmentType: message.attachmentType || '',
    attachmentName: message.attachmentName || '',
  });

  const beginReply = (message) => {
    setReplyingTo(createReplyReference(message));
    setActiveContextMenu(null);
    window.requestAnimationFrame(() => messageInputRef.current?.focus());
  };

  const formatMessageTime = (dateObj) => {
    if (!dateObj) return '';
    return dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const getMessageDate = (msg) => {
    if (msg.createdAt?.toDate) return msg.createdAt.toDate();
    if (msg.timestamp) return new Date(msg.timestamp);
    return new Date();
  };

  const getDateLabel = (dateObj) => {
    const today = new Date();
    const yesterday = new Date();
    yesterday.setDate(today.getDate() - 1);

    if (dateObj.toDateString() === today.toDateString()) return 'Today';
    if (dateObj.toDateString() === yesterday.toDateString()) return 'Yesterday';
    return dateObj.toLocaleDateString(undefined, {
      day: 'numeric',
      month: 'short',
      year: dateObj.getFullYear() !== today.getFullYear() ? 'numeric' : undefined
    });
  };

  const handleResolveExpenseDispute = async (message, action = 'solved', updates) => {
    if (!onResolveExpenseDispute) {
      showToast?.('Resolving disputes is unavailable right now.', 'error');
      return;
    }
    setResolvingDisputeIds((previous) => new Set(previous).add(message.id));
    try {
      await onResolveExpenseDispute(message, { action, updates });
      showToast?.(
        action === 'delete'
          ? 'Expense deleted and dispute resolved.'
          : action === 'update'
            ? 'Expense updated and dispute resolved.'
            : 'Dispute marked as resolved.'
      );
      setDisputeResolutionMessage(null);
      setDisputeResolutionMode('choices');
      setDisputeEditForm(null);
      setDisputeResolutionError('');
    } catch (error) {
      console.error('Could not resolve expense dispute:', error);
      setDisputeResolutionError(error.message || 'Could not resolve this dispute.');
    } finally {
      setResolvingDisputeIds((previous) => {
        const next = new Set(previous);
        next.delete(message.id);
        return next;
      });
    }
  };

  const openDisputeResolution = (message) => {
    const expense = expenses.find((item) => item.id === message.expenseId);
    if (!expense) {
      showToast?.('The disputed expense could not be found.', 'error');
      return;
    }
    setDisputeResolutionMessage(message);
    setDisputeResolutionMode('choices');
    setDisputeResolutionError('');
    setDisputeEditForm({
      title: expense.title || '',
      totalAmount: String(expense.totalAmount ?? ''),
      date: expense.date || '',
      paidBy: expense.paidBy || group.members?.[0] || '',
      category: expense.category || 'Other',
      paymentMethod: expense.paymentMethod || 'Other',
      splits: Object.fromEntries((group.members || []).map((memberId) => [
        memberId,
        String(expense.splits?.[memberId] ?? '0'),
      ])),
    });
  };

  const submitDisputeExpenseEdit = (event) => {
    event.preventDefault();
    const amount = Number(disputeEditForm?.totalAmount);
    const splitTotal = Object.values(disputeEditForm?.splits || {})
      .reduce((total, share) => total + (Number(share) || 0), 0);
    if (!disputeEditForm?.title.trim() || !Number.isFinite(amount) || amount <= 0) {
      setDisputeResolutionError('Enter a valid expense title and amount.');
      return;
    }
    if (Math.abs(splitTotal - amount) > 0.05) {
      setDisputeResolutionError('Member shares must add up to the expense total.');
      return;
    }
    void handleResolveExpenseDispute(disputeResolutionMessage, 'update', {
      ...disputeEditForm,
      totalAmount: amount,
    });
  };

  useEffect(() => {
    if (!db || !group?.id) return;

    const messagesRef = collection(db, 'messages');
    const q = query(messagesRef, where('groupId', '==', group.id));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const msgs = snapshot.docs.map(docSnapshot => ({
        id: docSnapshot.id,
        ...docSnapshot.data()
      }));

      setTypingMessages(msgs.filter((message) => message.type === 'typing'));

      const chatMessages = msgs.filter((message) => message.type !== 'typing');
      chatMessages.sort((a, b) => {
        const timeA = a.createdAt?.toMillis ? a.createdAt.toMillis() : (a.timestamp || 0);
        const timeB = b.createdAt?.toMillis ? b.createdAt.toMillis() : (b.timestamp || 0);
        return timeA - timeB;
      });

      setMessages(chatMessages);
    }, (err) => {
      console.error("Firestore chat error:", err);
    });

    return () => unsubscribe();
  }, [group?.id]);

  const hasActiveTypingStatus = typingMessages.some((message) => (
    message.groupId === group.id
    && message.senderId !== currentUser.id
    && message.typingExpiresAt > typingNow
  ));

  useEffect(() => {
    if (!hasActiveTypingStatus) return undefined;
    const initialRefresh = window.setTimeout(() => setTypingNow(Date.now()), 0);
    const interval = window.setInterval(() => setTypingNow(Date.now()), 1000);
    return () => {
      window.clearTimeout(initialRefresh);
      window.clearInterval(interval);
    };
  }, [hasActiveTypingStatus]);

  const typingUsers = useMemo(() => {
    const activeUsers = new Map();
    typingMessages.forEach((message) => {
      if (
        message.senderId
        && message.groupId === group.id
        && message.senderId !== currentUser.id
        && message.typingExpiresAt > typingNow
      ) {
        activeUsers.set(message.senderId, message.senderName || 'A roommate');
      }
    });
    return [...activeUsers.values()];
  }, [typingMessages, typingNow, group?.id, currentUser?.id]);

  const typingLabel = typingUsers.length === 1
    ? `${typingUsers[0]} is typing`
    : typingUsers.length === 2
      ? `${typingUsers[0]} and ${typingUsers[1]} are typing`
      : typingUsers.length > 2
        ? `${typingUsers[0]}, ${typingUsers[1]} and ${typingUsers.length - 2} others are typing`
        : '';

  useLayoutEffect(() => {
    const messageFeed = messageFeedRef.current;
    if (!messageFeed) return;
    messageFeed.style.overflowAnchor = 'none';
    messageFeed.scrollTop = messageFeed.scrollHeight;
    window.requestAnimationFrame(() => {
      if (initialAutoScrollRef.current && messageFeedRef.current) {
        messageFeedRef.current.scrollTop = messageFeedRef.current.scrollHeight;
      }
    });
    const settleTimer = window.setTimeout(() => {
      if (initialAutoScrollRef.current && messageFeedRef.current) {
        messageFeedRef.current.scrollTop = messageFeedRef.current.scrollHeight;
      }
    }, 150);
    return () => window.clearTimeout(settleTimer);
  }, [messages]);

  useLayoutEffect(() => {
    const messageFeed = messageFeedRef.current;
    const messageContent = messageContentRef.current;
    if (!messageFeed || !messageContent) return undefined;

    const observer = new ResizeObserver(() => {
      if (initialAutoScrollRef.current) {
        messageFeed.scrollTop = messageFeed.scrollHeight;
      }
    });
    observer.observe(messageContent);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!selectedImage) return undefined;
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') setSelectedImage(null);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedImage]);

  const visibleMessages = useMemo(() => {
    return messages.filter(msg => {
      if (msg.deletedFor && Array.isArray(msg.deletedFor) && msg.deletedFor.includes(currentUser.id)) {
        return false;
      }
      return true;
    });
  }, [messages, currentUser?.id]);

  // FIXED: Accurate exact width calculation and vertical alignment avoiding boundary drift
  const triggerContextMenu = (targetEl, msg, isMe) => {
    if (msg.isDeletedForEveryone || isSelectMode) return;
    const rect = targetEl.getBoundingClientRect();
    const windowHeight = window.innerHeight;
    const windowWidth = window.innerWidth;

    // Keep short-message previews readable while staying within the viewport.
    const popupWidth = Math.min(windowWidth - 32, Math.max(rect.width, 220));

    // Align horizontally with the clicked bubble's left position
    let xPos = rect.left;
    xPos = Math.max(16, Math.min(xPos, windowWidth - popupWidth - 16));

    // Calculate vertical position for the reaction bar, preview, and action list.
    const totalEstimatedHeight = 340;
    let yPos = rect.top - 50;
    if (yPos + totalEstimatedHeight > windowHeight - 16) {
      yPos = windowHeight - totalEstimatedHeight - 16;
    }
    if (yPos < 16) {
      yPos = 16;
    }

    setActiveContextMenu({
      message: msg,
      isMe,
      rect,
      width: popupWidth,
      xPos,
      yPos
    });
  };

  const handleTouchStart = (event, msg, isMe) => {
    if (msg.isDeletedForEveryone || isSelectMode) return;
    const touch = event.touches?.[0];
    touchStartRef.current = touch ? { x: touch.clientX, y: touch.clientY } : null;
    const currentTarget = event.currentTarget;

    pressTimerRef.current = setTimeout(() => {
      if (navigator.vibrate) navigator.vibrate(35);
      triggerContextMenu(currentTarget, msg, isMe);
    }, 500);
  };

  const handleTouchEnd = (event, message) => {
    if (pressTimerRef.current) {
      clearTimeout(pressTimerRef.current);
      pressTimerRef.current = null;
    }
    const start = touchStartRef.current;
    const touch = event.changedTouches?.[0];
    touchStartRef.current = null;
    if (!start || !touch || !message || isSelectMode || message.isDeletedForEveryone) return;

    const deltaX = touch.clientX - start.x;
    const deltaY = touch.clientY - start.y;
    if (Math.abs(deltaX) >= 64 && Math.abs(deltaX) > Math.abs(deltaY) * 1.3) {
      beginReply(message);
    }
  };

  const handleContextMenu = (e, msg, isMe) => {
    if (msg.isDeletedForEveryone || isSelectMode) return;
    e.preventDefault();
    triggerContextMenu(e.currentTarget, msg, isMe);
  };

  const handleBubbleClick = (msg) => {
    if (!isSelectMode || msg.isDeletedForEveryone) return;
    setSelectedMessageIds((prev) => {
      const next = new Set(prev);
      if (next.has(msg.id)) {
        next.delete(msg.id);
      } else {
        next.add(msg.id);
      }
      return next;
    });
  };

  const startSelectMode = (initialMessage) => {
    setActiveContextMenu(null);
    setIsSelectMode(true);
    setSelectedMessageIds(new Set([initialMessage.id]));
  };

  const exitSelectMode = () => {
    setIsSelectMode(false);
    setSelectedMessageIds(new Set());
  };

  const handleToggleReaction = async (message, emoji) => {
    if (!db || !message?.id || !currentUser?.id || message.isDeletedForEveryone) return;
    setActiveContextMenu(null);
    try {
      const msgRef = doc(db, 'messages', message.id);
      await runTransaction(db, async (transaction) => {
        const snapshot = await transaction.get(msgRef);
        if (!snapshot.exists() || snapshot.data().isDeletedForEveryone) return;

        const reactions = { ...(snapshot.data().reactions || {}) };
        if (reactions[currentUser.id] === emoji) delete reactions[currentUser.id];
        else reactions[currentUser.id] = emoji;
        transaction.update(msgRef, { reactions });
      });
    } catch (err) {
      console.error('Error toggling reaction:', err);
      showToast?.('Could not save reaction.', 'error');
    }
  };

  const notifyGroupMembers = (message) => {
    const recipientIds = (group.members || []).filter((id) => id !== currentUser.id);
    if (!recipientIds.length) return;

    const createdAt = new Date().toISOString();
    const senderName = currentUser.username || 'A member';
    const activityNotifications = recipientIds.map((recipientId) => ({
      id: `notif_chat_${Date.now()}_${recipientId}`,
      recipientId,
      senderId: currentUser.id,
      createdBy: currentUser.id,
      createdByName: senderName,
      groupId: group.id,
      type: 'CHAT_MESSAGE',
      message: `${senderName}: ${message}`,
      createdAt,
      read: false,
    }));

    onSendNotification?.(activityNotifications).catch((error) => {
      console.warn('Chat activity notification save failed:', error);
    });

    recipientIds.forEach((recipientId) => {
      triggerPushNotification({
        senderId: currentUser.id,
        recipientId,
        title: `Message in ${group.name || 'Group'}`,
        message: `${senderName}: ${message}`,
        groupId: group.id,
        avatarUserId: currentUser.id,
      }).catch((error) => console.warn('Chat push error:', error));
    });
  };

  const handleSend = async (e) => {
    e?.preventDefault();
    const cleanText = input.trim();
    if (!cleanText || !db) return;

    setInput('');
    if (messageInputRef.current) {
      messageInputRef.current.style.height = '40px';
      messageInputRef.current.style.overflowY = 'hidden';
    }

    try {
      stopTyping();
      await addDoc(collection(db, 'messages'), {
        groupId: group.id,
        senderId: currentUser.id,
        senderName: currentUser.username,
        text: cleanText,
        replyTo: replyingTo,
        timestamp: getTimestamp(),
        createdAt: serverTimestamp(),
        deletedFor: [],
        reactions: {}
      });

      setReplyingTo(null);
      notifyGroupMembers(cleanText);
    } catch (err) {
      console.error("Error sending message:", err);
    }
  };

  const appendEmoji = (emoji) => {
    setInput((prev) => `${prev}${emoji}`);
  };

  const handleSendSticker = async (sticker) => {
    setPickerTab(null);
    if (!db) return;
    try {
      await addDoc(collection(db, 'messages'), {
        groupId: group.id,
        senderId: currentUser.id,
        senderName: currentUser.username,
        text: sticker,
        replyTo: replyingTo,
        type: 'sticker',
        timestamp: getTimestamp(),
        createdAt: serverTimestamp(),
        deletedFor: [],
        reactions: {}
      });
      setReplyingTo(null);
      notifyGroupMembers('Sent a sticker');
    } catch (error) {
      console.error('Error sending sticker:', error);
      setAttachmentError('Sticker could not be sent.');
    }
  };

  const handleSendGif = async (gifUrl) => {
    setPickerTab(null);
    if (!db) return;
    try {
      await addDoc(collection(db, 'messages'), {
        groupId: group.id,
        senderId: currentUser.id,
        senderName: currentUser.username,
        text: '',
        replyTo: replyingTo,
        attachmentType: 'gif',
        attachmentName: 'reaction.gif',
        attachmentData: gifUrl,
        timestamp: getTimestamp(),
        createdAt: serverTimestamp(),
        deletedFor: [],
        reactions: {}
      });
      setReplyingTo(null);
      notifyGroupMembers('Sent a GIF');
    } catch (error) {
      console.error('Error sending gif:', error);
      setAttachmentError('GIF could not be sent.');
    }
  };

  // Process keyboard/file images, stickers, and gifs
  const uploadFileBlob = async (file) => {
    if (!file || !db || uploading) return;

    setAttachmentError('');
    const lowerName = file.name ? file.name.toLowerCase() : 'image.png';
    const isGif = file.type === 'image/gif' || lowerName.endsWith('.gif');
    const isWebp = file.type === 'image/webp' || lowerName.endsWith('.webp');
    const isImage = file.type.startsWith('image/') && !isGif;
    const isVideo = file.type.startsWith('video/');
    const isAudio = file.type.startsWith('audio/');
    const documentExtensions = ['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.txt', '.csv', '.zip'];
    const isDocument = documentExtensions.some((ext) => lowerName.endsWith(ext))
      || file.type === 'application/pdf'
      || file.type === 'text/plain'
      || file.type === 'text/csv';

    if (!isImage && !isGif && !isWebp && !isVideo && !isAudio && !isDocument) {
      setAttachmentError('Choose an image, video, audio, PDF, text, or file.');
      return;
    }
    const isCloudinaryMedia = isImage || isGif || isWebp || isVideo;
    if (!isCloudinaryMedia && file.size > 500 * 1024) {
      setAttachmentError('Files must be 500 KB or smaller.');
      return;
    }

    setUploading(true);
    try {
      let attachmentData;
      if (isCloudinaryMedia) {
        const uploadedMedia = await uploadChatMedia(file);
        attachmentData = uploadedMedia.url;
      } else {
        attachmentData = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result);
          reader.onerror = () => reject(new Error('Could not read this file.'));
          reader.readAsDataURL(file);
        });
      }

      const attachmentType = isGif ? 'gif' : isImage ? 'image' : isVideo ? 'video' : isAudio ? 'audio' : 'document';
      await addDoc(collection(db, 'messages'), {
        groupId: group.id,
        senderId: currentUser.id,
        senderName: currentUser.username,
        text: '',
        replyTo: replyingTo,
        attachmentType,
        attachmentName: file.name || (isGif ? 'sticker.gif' : 'keyboard-media.png'),
        attachmentMimeType: file.type || 'application/octet-stream',
        attachmentData,
        timestamp: getTimestamp(),
        createdAt: serverTimestamp(),
        deletedFor: [],
        reactions: {}
      });
      setReplyingTo(null);
      const attachmentLabel = attachmentType === 'image' ? 'photo' : attachmentType;
      notifyGroupMembers(`Sent a ${attachmentLabel}`);
    } catch (error) {
      console.error('Error uploading chat attachment:', error);
      setAttachmentError(error.message || 'Could not send this file.');
    } finally {
      setUploading(false);
    }
  };

  const handleFileUpload = (event) => {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = '';
    if (file) uploadFileBlob(file);
  };

  // Keyboard Gboard/iOS Sticker and GIF Paste Interceptor
  const handleInputPaste = (e) => {
    const items = e.clipboardData?.items;
    const files = e.clipboardData?.files;

    if (files && files.length > 0) {
      const file = files[0];
      if (file.type.startsWith('image/')) {
        e.preventDefault();
        uploadFileBlob(file);
        return;
      }
    }

    if (items) {
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.type.startsWith('image/')) {
          e.preventDefault();
          const blob = item.getAsFile();
          if (blob) {
            uploadFileBlob(blob);
            return;
          }
        }
      }
    }

    const pastedText = e.clipboardData?.getData('text/plain');
    if (!pastedText || !messageInputRef.current) return;

    e.preventDefault();
    const inputElement = messageInputRef.current;
    const normalizedText = pastedText.replace(/\r\n?/g, '\n');
    const selectionStart = inputElement.selectionStart;
    const selectionEnd = inputElement.selectionEnd;
    const nextInput = `${input.slice(0, selectionStart)}${normalizedText}${input.slice(selectionEnd)}`;
    const caretPosition = selectionStart + normalizedText.length;

    setInput(nextInput);
    updateTypingStatus(nextInput);
    window.requestAnimationFrame(() => {
      if (!messageInputRef.current) return;
      messageInputRef.current.setSelectionRange(caretPosition, caretPosition);
      messageInputRef.current.style.height = '40px';
      messageInputRef.current.style.height = `${Math.min(messageInputRef.current.scrollHeight, 128)}px`;
      messageInputRef.current.style.overflowY = messageInputRef.current.scrollHeight > 128 ? 'auto' : 'hidden';
    });
  };

  const handleCopyMessage = (msg) => {
    const textToCopy = msg.text || msg.attachmentName || '';
    if (textToCopy && navigator.clipboard) {
      navigator.clipboard.writeText(textToCopy);
      showToast?.('Copied to clipboard');
    }
    setActiveContextMenu(null);
  };

  const handleForwardMessages = async (destinationGroup) => {
    if (!db || !shareDialogMessages?.length || sharingGroupId) return;
    if (shareDialogMessages.length > MAX_BATCH_MESSAGES) {
      setShareError(`You can share up to ${MAX_BATCH_MESSAGES} messages at a time.`);
      return;
    }

    setSharingGroupId(destinationGroup.id);
    setShareError('');
    try {
      const batch = writeBatch(db);
      for (const message of shareDialogMessages) {
        const attachmentData = message.attachmentData || message.mediaData || null;
        const messageRef = doc(collection(db, 'messages'));
        batch.set(messageRef, {
          groupId: destinationGroup.id,
          senderId: currentUser.id,
          senderName: currentUser.username,
          text: message.text || '',
          ...(message.type === 'sticker' ? { type: 'sticker' } : {}),
          attachmentType: message.attachmentType || null,
          attachmentName: message.attachmentName || null,
          attachmentMimeType: message.attachmentMimeType || null,
          attachmentData,
          forwardedFromGroupName: group.name,
          timestamp: getTimestamp(),
          createdAt: serverTimestamp(),
          deletedFor: [],
          reactions: {}
        });
      }
      await batch.commit();
      setShareDialogMessages(null);
      exitSelectMode();
      showToast?.(`${shareDialogMessages.length} message(s) shared to ${destinationGroup.name}.`);
    } catch (error) {
      console.error('Error sharing message to group:', error);
      setShareError('Could not share messages. Please try again.');
    } finally {
      setSharingGroupId(null);
    }
  };

  const handleDeleteBatchForMe = async (messagesToDelete) => {
    if (deletingMessage) return;
    if (!db || !messagesToDelete?.length) {
      setDeleteError('No messages selected.');
      return;
    }
    if (messagesToDelete.length > MAX_BATCH_MESSAGES) {
      setDeleteError(`You can delete up to ${MAX_BATCH_MESSAGES} messages at a time.`);
      return;
    }
    setDeletingMessage(true);
    setDeleteError('');
    try {
      const batch = writeBatch(db);
      for (const message of messagesToDelete) {
        const msgRef = doc(db, 'messages', message.id);
        batch.update(msgRef, {
          deletedFor: arrayUnion(currentUser.id)
        });
      }
      await batch.commit();
      setDeleteDialogMessages(null);
      exitSelectMode();
    } catch (err) {
      console.error('Error deleting messages for me:', err);
      setDeleteError('Could not delete selected messages.');
    } finally {
      setDeletingMessage(false);
    }
  };

  const handleDeleteBatchForEveryone = async (messagesToDelete) => {
    if (deletingMessage) return;
    if (!db || !messagesToDelete?.length) {
      setDeleteError('No messages selected.');
      return;
    }
    if (messagesToDelete.length > MAX_BATCH_MESSAGES) {
      setDeleteError(`You can delete up to ${MAX_BATCH_MESSAGES} messages at a time.`);
      return;
    }
    setDeletingMessage(true);
    setDeleteError('');
    try {
      const batch = writeBatch(db);
      const deletableMessages = messagesToDelete.filter(
        (message) => message.senderId === currentUser.id || group.createdBy === currentUser.id
      );
      if (deletableMessages.length !== messagesToDelete.length) {
        setDeleteError('You can only delete your own messages for everyone.');
        return;
      }
      for (const message of deletableMessages) {
        const msgRef = doc(db, 'messages', message.id);
        batch.update(msgRef, {
          isDeletedForEveryone: true,
          text: 'This message was deleted',
          attachmentData: null,
          mediaData: null,
          attachmentType: null,
          type: 'deleted'
        });
      }
      await batch.commit();
      setDeleteDialogMessages(null);
      exitSelectMode();
    } catch (err) {
      console.error('Error deleting messages for everyone:', err);
      setDeleteError('Could not delete selected messages.');
    } finally {
      setDeletingMessage(false);
    }
  };

  const handleClearChatForMe = async () => {
    if (!db || visibleMessages.length === 0) return;
    setClearing(true);
    try {
      for (const msg of visibleMessages) {
        const msgRef = doc(db, 'messages', msg.id);
        await updateDoc(msgRef, {
          deletedFor: arrayUnion(currentUser.id)
        });
      }
      setShowClearConfirm(false);
    } catch (err) {
      console.error('Error clearing chat:', err);
    } finally {
      setClearing(false);
    }
  };

  const selectedMessages = useMemo(() => {
    return visibleMessages.filter(
      (message) => !message.isDeletedForEveryone && selectedMessageIds.has(message.id)
    );
  }, [visibleMessages, selectedMessageIds]);

  const deleteCandidates = deleteDialogMessages || selectedMessages;
  const canDeleteAllForEveryone = deleteCandidates.length > 0 && deleteCandidates.every(
    (message) => (
      message.type !== 'expense_dispute'
      && (message.senderId === currentUser.id || group.createdBy === currentUser.id)
    )
  );
  const resolutionExpense = expenses.find(
    (expense) => expense.id === disputeResolutionMessage?.expenseId
  );
  const canEditDisputedExpense = Boolean(
    resolutionExpense
    && (resolutionExpense.createdBy === currentUser.id || resolutionExpense.paidBy === currentUser.id)
  );
  const canMarkDisputeSolved = Boolean(
    disputeResolutionMessage
    && (
      resolutionExpense?.createdBy === currentUser.id
      || disputeResolutionMessage.disputedBy === currentUser.id
    )
  );

  return (
    <div className="flex-1 flex flex-col min-h-0 relative overflow-hidden bg-white font-sans select-none">

      {/* WhatsApp-Style Selection Mode Top Bar */}
      {isSelectMode ? (
        <div className="relative z-30 flex items-center justify-between px-4 py-2.5 bg-white/95 backdrop-blur-xl border-b border-slate-200/80 shadow-sm animate-in slide-in-from-top-2 duration-150">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={exitSelectMode}
              className="p-1.5 rounded-full hover:bg-slate-100 text-slate-600 transition-colors"
              title="Cancel Selection"
            >
              <X size={18} />
            </button>
            <span className="text-sm font-bold text-slate-800">
              {selectedMessages.length} selected
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={selectedMessages.length === 0}
              onClick={() => {
                setShareError('');
                setShareDialogMessages(selectedMessages);
              }}
              className="p-2 rounded-xl text-slate-600 hover:text-sky-600 hover:bg-sky-50 transition-all disabled:opacity-40"
              title="Forward Selected"
            >
              <Share2 size={17} />
            </button>

            <button
              type="button"
              disabled={selectedMessages.length === 0}
              onClick={() => {
                setDeleteError('');
                setDeleteDialogMessages(selectedMessages);
              }}
              className="p-2 rounded-xl text-slate-600 hover:text-rose-600 hover:bg-rose-50 transition-all disabled:opacity-40"
              title="Delete Selected"
            >
              <Trash2 size={17} />
            </button>
          </div>
        </div>
      ) : (
        visibleMessages.length > 0 && (
          <button
            onClick={() => setShowClearConfirm(true)}
            className="absolute top-3 right-4 z-20 p-2 rounded-full bg-white/80 hover:bg-white text-slate-400 hover:text-rose-600 border border-slate-200/60 shadow-xs backdrop-blur-md transition-all active:scale-90"
            title="Clear Conversation"
            aria-label="Clear Chat"
          >
            <Trash2 size={15} />
          </button>
        )
      )}

      {/* Main Message Feed */}
      <div
        ref={messageFeedRef}
        onWheel={() => { initialAutoScrollRef.current = false; }}
        onTouchStart={() => { initialAutoScrollRef.current = false; }}
        onLoadCapture={() => {
          if (initialAutoScrollRef.current && messageFeedRef.current) {
            messageFeedRef.current.scrollTop = messageFeedRef.current.scrollHeight;
          }
        }}
        className="flex-1 min-h-0 overflow-y-auto px-3 sm:px-6 py-4 relative z-10 scrollbar-hide [overflow-anchor:none]"
      >
        <div ref={messageContentRef} className="flow-root min-h-full space-y-1">
          {visibleMessages.length === 0 ? (
            <EmptyState
              icon={MessageCircle}
              title="No messages yet"
              description="Chat, share receipts, notes, or coordinate room spending right here!"
              className="min-h-full border-0 bg-transparent"
            />
          ) : (
            visibleMessages.map((msg, index) => {
              const isMe = msg.senderId === currentUser.id;
              const disputedExpense = msg.type === 'expense_dispute'
                ? expenses.find((expense) => expense.id === msg.expenseId)
                : null;
              const canResolveThisDispute = Boolean(
                msg.type === 'expense_dispute'
                && (
                  msg.disputedBy === currentUser.id
                  || disputedExpense?.createdBy === currentUser.id
                )
              );
              const sender = getUser(msg.senderId);
              const msgDate = getMessageDate(msg);
              const timeString = formatMessageTime(msgDate);

              const prevMsg = visibleMessages[index - 1];
              const prevDate = prevMsg ? getMessageDate(prevMsg) : null;
              const showDateDivider = !prevDate || prevDate.toDateString() !== msgDate.toDateString();

              const isFirstOfCluster = !prevMsg || prevMsg.senderId !== msg.senderId || showDateDivider;
              const isDeleted = msg.isDeletedForEveryone;
              const onlyEmoji = !isDeleted && !msg.attachmentData && !msg.mediaData && msg.type !== 'sticker' && isOnlyEmojis(msg.text);
              const messageLinks = !isDeleted && msg.text ? extractLinks(msg.text) : [];

              const isSelected = selectedMessageIds.has(msg.id) && !msg.isDeletedForEveryone;

              const reactionsMap = msg.reactions || {};
              const reactionEntries = Object.entries(reactionsMap);
              const hasReactions = reactionEntries.length > 0;

              return (
                <div key={msg.id} className="w-full">
                  {showDateDivider && (
                    <div className="flex justify-center my-3.5">
                      <span className="px-3 py-1 text-[11px] font-bold text-slate-600 bg-white/95 backdrop-blur-md rounded-full shadow-[0_1px_3px_rgba(0,0,0,0.08)] border border-slate-200/60 select-none">
                        {getDateLabel(msgDate)}
                      </span>
                    </div>
                  )}

                  <div className={`flex items-end gap-2.5 ${
                    hasReactions
                      ? 'mb-3.5'
                      : msg.type === 'expense_dispute'
                        ? 'my-1.5'
                        : 'my-1'
                  } ${isMe ? 'justify-end' : 'justify-start'}`}>
                    {isSelectMode && (
                      <div 
                        onClick={() => handleBubbleClick(msg)}
                        className={`w-5 h-5 rounded-md border flex items-center justify-center cursor-pointer transition-all flex-shrink-0 self-center ${
                          isSelected 
                            ? 'bg-sky-500 border-sky-500 text-white shadow-xs' 
                            : 'border-slate-300 bg-white hover:border-slate-400'
                        }`}
                      >
                        {isSelected && <Check size={13} strokeWidth={3.5} />}
                      </div>
                    )}

                    <div className={`relative min-w-0 max-w-[70%] sm:max-w-none ${
                      msg.type === 'expense_dispute' ? 'w-[min(22rem,70vw)]' : ''
                    }`}>
                      <div 
                        onClick={() => handleBubbleClick(msg)}
                        onTouchStart={(e) => handleTouchStart(e, msg, isMe)}
                        onTouchEnd={(event) => handleTouchEnd(event, msg)}
                        onTouchCancel={handleTouchEnd}
                        onMouseDown={(e) => handleTouchStart(e, msg, isMe)}
                        onMouseUp={handleTouchEnd}
                        onMouseLeave={handleTouchEnd}
                        onContextMenu={(e) => handleContextMenu(e, msg, isMe)}
                        className={`relative ${
                          msg.type === 'expense_dispute' ? 'w-full' : 'w-fit'
                        } max-w-full break-words sm:max-w-[70vw] transition-all cursor-pointer select-none active:scale-[0.99] ${
                          isSelected ? 'ring-2 ring-sky-500/80 rounded-2xl' : ''
                        } ${
                          onlyEmoji 
                            ? 'bg-transparent shadow-none border-none p-1' 
                            : isDeleted
                              ? 'bg-slate-100 text-slate-400 italic border border-slate-200/80 px-3 py-1.5 rounded-2xl shadow-xs'
                              : msg.type === 'expense_dispute'
                                ? 'bg-amber-50 text-amber-950 border border-amber-200 rounded-2xl shadow-[0_1px_2px_rgba(0,0,0,0.06)]'
                                : isMe
                                  ? 'bg-gradient-to-br from-sky-500 via-blue-500 to-blue-500 text-white rounded-2xl rounded-br-xs shadow-[0_1px_3px_rgba(89,131,98,0.25)]'
                                  : 'bg-white text-slate-800 border border-slate-200/70 rounded-2xl rounded-bl-xs shadow-[0_1px_2px_rgba(0,0,0,0.06)]'
                        }`}
                      >
                        {!isMe && isFirstOfCluster && !isDeleted && !onlyEmoji && (
                          <div className="px-3 pt-2 text-[11px] font-black text-sky-600 tracking-wider uppercase">
                            {msg.senderName || sender.username}
                          </div>
                        )}

                        {isDeleted ? (
                          <div className="flex items-center gap-1.5 text-xs py-0.5">
                            <Ban size={13} className="text-slate-400" />
                            <span>This message was deleted</span>
                            <span className="text-[10px] text-slate-400 ml-2 font-normal not-italic">{timeString}</span>
                          </div>
                        ) : onlyEmoji ? (
                          <div className="flex flex-col items-center">
                            <span className="text-5xl py-0.5 leading-tight filter drop-shadow-sm select-none">
                              {msg.text}
                            </span>
                            <span className="inline-flex items-center gap-1 text-[9.5px] font-semibold text-slate-400 bg-white/70 backdrop-blur-md px-1.5 py-0.5 rounded-full shadow-2xs mt-0.5">
                              {timeString}
                              {isMe && <CheckCheck size={11} className="text-sky-500" />}
                            </span>
                          </div>
                        ) : (
                          <>
                            {msg.forwardedFromGroupName && (
                              <div className={`px-3 pt-2 text-[10px] font-semibold italic flex items-center gap-1 ${isMe ? 'text-sky-100/80' : 'text-slate-400'}`}>
                                <CornerUpRight size={11} />
                                <span>Forwarded from {msg.forwardedFromGroupName}</span>
                              </div>
                            )}

                            {msg.replyTo && (
                              <div className={`mx-2 mt-2 rounded-lg border-l-[3px] px-2.5 py-1.5 ${
                                isMe ? 'border-white/80 bg-white/15' : 'border-sky-500 bg-slate-100/90'
                              }`}>
                                <span className={`block truncate text-[10px] font-bold ${
                                  isMe ? 'text-sky-50' : 'text-sky-700'
                                }`}>
                                  {msg.replyTo.senderId === currentUser.id
                                    ? 'You'
                                    : msg.replyTo.senderName || 'Roommate'}
                                </span>
                                <span className={`line-clamp-2 whitespace-pre-wrap break-words text-[11px] leading-snug ${
                                  isMe ? 'text-white/90' : 'text-slate-600'
                                }`}>
                                  {getReplySummary(msg.replyTo)}
                                </span>
                              </div>
                            )}

                            {(msg.attachmentData || msg.mediaData) && (
                              <div className="overflow-hidden rounded-xl p-1">
                                {msg.attachmentType === 'image' || msg.attachmentType === 'gif' ? (
                                  <div className="relative">
                                    <img 
                                      src={msg.attachmentData || msg.mediaData} 
                                      alt="Chat media" 
                                      onClick={(e) => {
                                        if (isSelectMode) return;
                                        e.stopPropagation();
                                        setSelectedImage({ ...msg, attachmentData: msg.attachmentData || msg.mediaData });
                                      }}
                                      className="max-h-72 w-full object-cover rounded-xl" 
                                      loading="lazy" 
                                    />
                                    <div className="absolute bottom-2 right-2 flex items-center gap-1 bg-black/60 backdrop-blur-md px-2 py-0.5 rounded-full text-[10px] font-semibold text-white">
                                      <span>{timeString}</span>
                                      {isMe && <CheckCheck size={12} className="text-sky-300" />}
                                    </div>
                                  </div>
                                ) : msg.attachmentType === 'video' ? (
                                  <div className="relative rounded-xl overflow-hidden bg-black max-w-sm">
                                    <VideoPlayer src={msg.attachmentData || msg.mediaData} mimeType={msg.attachmentMimeType} />
                                    <div className="absolute bottom-2 right-2 flex items-center gap-1 bg-black/60 backdrop-blur-md px-2 py-0.5 rounded-full text-[10px] font-semibold text-white">
                                      <span>{timeString}</span>
                                      {isMe && <CheckCheck size={12} className="text-sky-300" />}
                                    </div>
                                  </div>
                                ) : msg.attachmentType === 'audio' ? (
                                  <div className="p-2 space-y-1">
                                    <audio src={msg.attachmentData || msg.mediaData} controls className="w-full h-8" />
                                  </div>
                                ) : (
                                  <div className={`flex items-center gap-2.5 p-2.5 rounded-xl border ${
                                    isMe ? 'bg-white/10 border-white/20' : 'bg-slate-50 border-slate-200/80'
                                  }`}>
                                    <FileText size={20} className={isMe ? 'text-white' : 'text-sky-500'} />
                                    <div className="min-w-0 flex-1">
                                      <p className="truncate text-xs font-bold">{msg.attachmentName || 'Document'}</p>
                                      <a href={msg.attachmentData} download className="text-[10px] underline font-semibold">Download</a>
                                    </div>
                                  </div>
                                )}
                              </div>
                            )}

                            {msg.type === 'expense_dispute' ? (
                              <div className="w-full min-w-0 px-3 py-2.5">
                                <div className="flex min-w-0 flex-wrap items-center gap-2 text-xs font-extrabold text-amber-800">
                                  <AlertTriangle size={15} className="shrink-0" />
                                  <span className="min-w-0 flex-1">Expense dispute</span>
                                  <span className={`ml-auto rounded-full px-2 py-0.5 text-[9px] uppercase tracking-wide ${
                                    msg.status === 'resolved'
                                      ? 'bg-emerald-100 text-emerald-700'
                                      : msg.status === 'cancelled'
                                        ? 'bg-slate-200 text-slate-700'
                                        : 'bg-amber-200 text-amber-900'
                                  }`}>
                                    {msg.status === 'resolved'
                                      ? 'Resolved'
                                      : msg.status === 'cancelled' ? 'Cancelled' : 'Open'}
                                  </span>
                                </div>
                                <p className="mt-1.5 min-w-0 break-words text-xs font-bold text-slate-900 [overflow-wrap:anywhere]">
                                  {msg.expenseTitle || 'Expense'}
                                </p>
                                {msg.expenseAmount != null && (
                                  <p className="mt-0.5 text-[11px] text-slate-600">
                                    {formatCurrency(msg.expenseAmount, group.currency)}
                                  </p>
                                )}
                                <p className="mt-1 break-words text-[11px] text-slate-600 [overflow-wrap:anywhere]">
                                  Raised by {msg.disputedByName || msg.senderName || 'a member'}
                                  {msg.status === 'resolved'
                                    ? ` · Resolved by ${msg.resolvedByName || 'a member'}`
                                    : msg.status === 'cancelled'
                                      ? ` · Cancelled by ${msg.cancelledByName || 'the raiser'}`
                                      : ''}
                                </p>
                                {msg.disputeMessage && (
                                  <p className="mt-2 whitespace-pre-wrap break-words rounded-lg bg-white/80 px-2.5 py-2 text-xs text-slate-700">
                                    {msg.disputeMessage}
                                  </p>
                                )}
                                {msg.status !== 'resolved' && canResolveThisDispute && (
                                  msg.status === 'open' && (
                                  <button
                                    type="button"
                                    disabled={resolvingDisputeIds.has(msg.id)}
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      openDisputeResolution(msg);
                                    }}
                                    className="mt-2 rounded-lg bg-amber-700 px-2.5 py-1.5 text-[10px] font-bold text-white transition-colors hover:bg-amber-800 disabled:cursor-wait disabled:opacity-60"
                                  >
                                    Resolve dispute
                                  </button>
                                  )
                                )}
                                {msg.status === 'resolved' && msg.resolutionAction && (
                                  <p className="mt-2 text-[10px] font-semibold text-emerald-700">
                                    {msg.resolutionAction === 'delete'
                                      ? 'Transaction deleted'
                                      : msg.resolutionAction === 'update'
                                        ? 'Transaction updated'
                                        : 'Marked as solved'}
                                  </p>
                                )}
                                {msg.status === 'cancelled' && (
                                  <p className="mt-2 text-[10px] font-semibold text-slate-500">Dispute cancelled</p>
                                )}
                                <div className="mt-1.5 flex justify-end text-[9.5px] font-semibold text-slate-400">
                                  {timeString}
                                </div>
                              </div>
                            ) : msg.type === 'sticker' ? (
                              <div className="px-3 py-1">
                                <span className="text-6xl leading-none select-none">{msg.text}</span>
                                <div className={`text-[9.5px] text-right mt-1 font-semibold flex items-center justify-end gap-1 ${
                                  isMe ? 'text-sky-100/90' : 'text-slate-400'
                                }`}>
                                  <span>{timeString}</span>
                                  {isMe && <CheckCheck size={12} className="text-sky-200" />}
                                </div>
                              </div>
                            ) : msg.text ? (
                              <div className="px-3 py-1.5 text-[13.5px] leading-relaxed">
                                <span className="whitespace-pre-wrap font-normal break-words [overflow-wrap:anywhere] select-text mr-1.5">
                                  {renderLinkedText(msg.text)}
                                </span>
                                {messageLinks.slice(0, 2).map(({ url }) => (
                                  <LinkPreview key={url} url={url} isMe={isMe} />
                                ))}
                                
                                <span className={`inline-flex items-center gap-0.5 text-[9.5px] font-semibold select-none float-right ml-1.5 mt-1 self-end ${
                                  isMe ? 'text-sky-100/90' : 'text-slate-400'
                                }`}>
                                  <span>{timeString}</span>
                                  {isMe && <CheckCheck size={12} className="text-sky-200" />}
                                </span>
                              </div>
                            ) : null}
                          </>
                        )}
                      </div>

                      {hasReactions && (
                        <div 
                          onClick={(e) => {
                            e.stopPropagation();
                            if (reactionsMap[currentUser.id]) {
                              handleToggleReaction(msg, reactionsMap[currentUser.id]);
                            }
                          }}
                          className={`absolute -bottom-2.5 ${isMe ? 'right-2' : 'left-2'} z-10 flex items-center gap-0.5 bg-white/95 backdrop-blur-md px-1.5 py-0.5 rounded-full border border-slate-200/80 shadow-xs text-xs font-semibold select-none cursor-pointer hover:scale-105 active:scale-95 transition-transform`}
                          title="View / remove reaction"
                        >
                          {reactionEntries.slice(0, 3).map(([userId, emo]) => (
                            <span key={userId} className="leading-none text-[13px]">{emo}</span>
                          ))}
                          {reactionEntries.length > 1 && (
                            <span className="text-[10px] text-slate-500 font-bold ml-0.5">
                              {reactionEntries.length}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
          {typingLabel && (
            <div
              className="flex min-h-9 items-center gap-2 px-2 text-xs font-semibold text-slate-500"
              aria-live="polite"
              aria-label={`${typingLabel}...`}
            >
              <span>{typingLabel}</span>
              <span className="inline-flex items-center gap-1" aria-hidden="true">
                {[0, 1, 2].map((dot) => (
                  <span
                    key={dot}
                    className="h-1.5 w-1.5 animate-bounce rounded-full bg-sky-500"
                    style={{ animationDelay: `${dot * 160}ms` }}
                  />
                ))}
              </span>
            </div>
          )}
          <div ref={bottomRef} />
        </div>
      </div>

      {/* Blurred Liquid Glass Pop-up Menu */}
      {activeContextMenu && createPortal(
        <div 
          className="fixed inset-0 z-[110] bg-slate-950/45 backdrop-blur-md animate-in fade-in duration-150"
          onClick={() => setActiveContextMenu(null)}
        >
          <div 
            className="absolute flex flex-col gap-2 z-10 animate-in zoom-in-95 duration-150"
            style={{
              left: `${activeContextMenu.xPos}px`,
              top: `${activeContextMenu.yPos}px`,
              width: `${activeContextMenu.width}px`
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Quick Emoji Reaction Pill Bar */}
            <div className={`flex items-center justify-between bg-white/95 backdrop-blur-2xl px-3.5 py-1.5 rounded-full shadow-2xl border border-white/70 w-fit gap-1.5 ${
              activeContextMenu.isMe ? 'self-end' : 'self-start'
            }`}>
              {QUICK_REACTIONS.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  onClick={() => handleToggleReaction(activeContextMenu.message, emoji)}
                  className="text-xl hover:scale-125 active:scale-90 transition-transform px-1"
                >
                  {emoji}
                </button>
              ))}
            </div>

            {/* Highlighted Message Preview: Exact Original Width & 3-4 Lines Clamp */}
            <div className={`w-full p-3.5 rounded-2xl shadow-xl border text-[13.5px] leading-relaxed break-words backdrop-blur-xl ${
              activeContextMenu.isMe
                ? 'bg-gradient-to-br from-sky-500 via-blue-500 to-blue-500 text-white border-white/30 shadow-sky-500/20'
                : 'bg-white/95 text-slate-800 border-white/80 shadow-slate-900/10'
            }`}>
              {activeContextMenu.message.text ? (
                <p className="line-clamp-4 whitespace-pre-wrap select-text font-normal">
                  {activeContextMenu.message.text}
                </p>
              ) : activeContextMenu.message.type === 'sticker' ? (
                <div className="flex justify-center py-1">
                  <span className="text-4xl">{activeContextMenu.message.text}</span>
                </div>
              ) : activeContextMenu.message.attachmentData ? (
                <div className="flex items-center gap-2.5">
                  {activeContextMenu.message.attachmentType === 'image' || activeContextMenu.message.attachmentType === 'gif' ? (
                    <img 
                      src={activeContextMenu.message.attachmentData} 
                      alt="preview" 
                      className="w-14 h-14 rounded-xl object-cover flex-shrink-0" 
                    />
                  ) : (
                    <FileText size={24} className={activeContextMenu.isMe ? 'text-white' : 'text-sky-500'} />
                  )}
                  <span className="truncate text-xs font-bold flex-1">
                    {activeContextMenu.message.attachmentName || 'Media attachment'}
                  </span>
                </div>
              ) : (
                'Message'
              )}
            </div>

            {/* iOS-Style Stacked Options Menu */}
            <div className={`overflow-hidden rounded-2xl bg-white/95 backdrop-blur-2xl shadow-2xl border border-white/70 divide-y divide-slate-100/90 w-full max-w-[240px] sm:max-w-[260px] ${
              activeContextMenu.isMe ? 'self-end' : 'self-start'
            }`}>
              {activeContextMenu.message.text && (
                <button
                  type="button"
                  onClick={() => handleCopyMessage(activeContextMenu.message)}
                  className="flex w-full items-center justify-between px-4 py-2.5 text-xs font-bold text-slate-800 hover:bg-slate-50 transition-colors"
                >
                  <span>Copy</span>
                  <Copy size={15} className="text-slate-400" />
                </button>
              )}

              <button
                type="button"
                onClick={() => beginReply(activeContextMenu.message)}
                className="flex w-full items-center justify-between px-4 py-2.5 text-xs font-bold text-slate-800 hover:bg-slate-50 transition-colors"
              >
                <span>Reply</span>
                <Reply size={15} className="text-slate-400" />
              </button>

              <button
                type="button"
                onClick={() => startSelectMode(activeContextMenu.message)}
                className="flex w-full items-center justify-between px-4 py-2.5 text-xs font-bold text-slate-800 hover:bg-slate-50 transition-colors"
              >
                <span>Select</span>
                <CheckSquare size={15} className="text-slate-400" />
              </button>

              <button
                type="button"
                onClick={() => {
                  const targetMsg = activeContextMenu.message;
                  setActiveContextMenu(null);
                  setShareError('');
                  setShareDialogMessages([targetMsg]);
                }}
                className="flex w-full items-center justify-between px-4 py-2.5 text-xs font-bold text-slate-800 hover:bg-slate-50 transition-colors"
              >
                <span>Forward</span>
                <Share2 size={15} className="text-slate-400" />
              </button>

              <button
                type="button"
                onClick={() => {
                  const targetMsg = activeContextMenu.message;
                  setActiveContextMenu(null);
                  setDeleteError('');
                  setDeleteDialogMessages([targetMsg]);
                }}
                className="flex w-full items-center justify-between px-4 py-2.5 text-xs font-bold text-rose-600 hover:bg-rose-50 transition-colors"
              >
                <span>Delete…</span>
                <Trash2 size={15} className="text-rose-500" />
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Delete Confirmation Sheet */}
      {deleteDialogMessages && createPortal(
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-md animate-in fade-in duration-150">
          <div className="w-full max-w-xs rounded-3xl p-5 bg-white/95 backdrop-blur-2xl shadow-2xl border border-white/70 text-center animate-in zoom-in-95 duration-150">
            <h3 className="text-sm font-extrabold text-slate-900 mb-1">
              Delete {deleteDialogMessages.length > 1 ? `${deleteDialogMessages.length} messages` : 'message'}?
            </h3>
            <p className="text-xs text-slate-500 mb-4 leading-relaxed">
              Choose how you want to remove selected message(s).
            </p>
            {deleteError && <p role="alert" className="mb-3 rounded-xl bg-rose-50 px-3 py-2 text-left text-xs font-medium text-rose-700">{deleteError}</p>}

            <div className="space-y-2">
              <button
                type="button"
                onClick={() => handleDeleteBatchForMe(deleteDialogMessages)}
                disabled={deletingMessage}
                className="w-full py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs transition-colors"
              >
                {deletingMessage ? 'Deleting...' : 'Delete for Me'}
              </button>

              {canDeleteAllForEveryone && (
                <button
                  type="button"
                  onClick={() => handleDeleteBatchForEveryone(deleteDialogMessages)}
                  disabled={deletingMessage}
                  className="w-full py-2.5 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-600 font-bold text-xs transition-colors"
                >
                  {deletingMessage ? 'Deleting...' : 'Delete for Everyone'}
                </button>
              )}

              <button
                type="button"
                onClick={() => setDeleteDialogMessages(null)}
                disabled={deletingMessage}
                className="w-full py-2.5 rounded-xl border border-slate-200 text-slate-600 font-semibold text-xs hover:bg-slate-50 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Forward/Share Message Dialog */}
      {shareDialogMessages && createPortal(
        <div
          className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/40 p-4 backdrop-blur-md animate-in fade-in duration-150"
          onClick={() => {
            if (!sharingGroupId) setShareDialogMessages(null);
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="share-message-title"
            className="w-full max-w-sm overflow-hidden rounded-3xl border border-white/70 bg-white/95 p-5 shadow-2xl backdrop-blur-xl animate-in zoom-in-95 duration-150"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-2xl bg-sky-50 text-sky-600">
                  <Share2 size={19} />
                </div>
                <h3 id="share-message-title" className="text-base font-extrabold text-slate-900">
                  Forward {shareDialogMessages.length > 1 ? `${shareDialogMessages.length} messages` : 'message'}
                </h3>
                <p className="mt-1 text-xs text-slate-500">Choose one of your other shared spaces.</p>
              </div>
              <button
                type="button"
                onClick={() => setShareDialogMessages(null)}
                disabled={Boolean(sharingGroupId)}
                className="flex h-8 w-8 items-center justify-center rounded-full text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 disabled:opacity-50"
                aria-label="Close forward dialog"
              >
                <X size={17} />
              </button>
            </div>

            {shareError && <p role="alert" className="mb-3 rounded-xl bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700">{shareError}</p>}

            <div className="max-h-72 space-y-2 overflow-y-auto overscroll-contain">
              {groups
                .filter((candidate) => candidate.id !== group.id && candidate.members?.includes(currentUser.id))
                .map((destinationGroup) => (
                  <button
                    key={destinationGroup.id}
                    type="button"
                    onClick={() => handleForwardMessages(destinationGroup)}
                    disabled={Boolean(sharingGroupId)}
                    className="flex w-full items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3 text-left transition-colors hover:border-sky-200 hover:bg-sky-50/60 disabled:cursor-wait disabled:opacity-60"
                  >
                    <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-sky-50 text-sm font-extrabold text-sky-700">
                      {destinationGroup.name?.charAt(0).toUpperCase() || <Users size={17} />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-bold text-slate-800">{destinationGroup.name}</span>
                      <span className="mt-0.5 block text-xs text-slate-500">{destinationGroup.members?.length || 0} members</span>
                    </span>
                    <span className="text-xs font-semibold text-sky-600">
                      {sharingGroupId === destinationGroup.id ? 'Forwarding…' : 'Forward'}
                    </span>
                  </button>
                ))}
              {groups.filter((candidate) => candidate.id !== group.id && candidate.members?.includes(currentUser.id)).length === 0 && (
                <div className="rounded-2xl border border-dashed border-slate-200 px-4 py-8 text-center">
                  <Users size={22} className="mx-auto mb-2 text-slate-300" />
                  <p className="text-sm font-semibold text-slate-600">No other groups yet</p>
                  <p className="mt-1 text-xs text-slate-400">Join or create another group to share this message.</p>
                </div>
              )}
            </div>
          </section>
        </div>,
        document.body
      )}

      {/* Floating Liquid Glass Input Bar */}
      {!isSelectMode && (
        <div className="relative z-20 px-3 pb-6 sm:px-6 pt-2">
          {attachmentError && (
            <div className="max-w-3xl mx-auto mb-2 px-3 py-1.5 rounded-xl bg-rose-50 text-rose-600 text-xs font-semibold border border-rose-200/80 animate-in fade-in duration-150">
              {attachmentError}
            </div>
          )}

          {/* Tabbed Emoji, Sticker & GIF Picker */}
          {pickerTab && (
            <div className="max-w-3xl mx-auto mb-3 rounded-[28px] bg-white/95 backdrop-blur-2xl border border-white/80 p-3 shadow-2xl animate-in zoom-in-95 duration-150">
              <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-100">
                <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl">
                  <button
                    type="button"
                    onClick={() => setPickerTab('emoji')}
                    className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                      pickerTab === 'emoji' ? 'bg-white text-sky-600 shadow-2xs' : 'text-slate-500'
                    }`}
                  >
                    Emoji
                  </button>
                  <button
                    type="button"
                    onClick={() => setPickerTab('sticker')}
                    className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                      pickerTab === 'sticker' ? 'bg-white text-sky-600 shadow-2xs' : 'text-slate-500'
                    }`}
                  >
                    Stickers
                  </button>
                  <button
                    type="button"
                    onClick={() => setPickerTab('gif')}
                    className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                      pickerTab === 'gif' ? 'bg-white text-sky-600 shadow-2xs' : 'text-slate-500'
                    }`}
                  >
                    GIFs
                  </button>
                </div>

                <button 
                  type="button" 
                  onClick={() => setPickerTab(null)} 
                  className="w-6 h-6 flex items-center justify-center rounded-full text-slate-400 hover:text-slate-700 bg-slate-100 transition-colors"
                >
                  <X size={14} />
                </button>
              </div>

              {pickerTab === 'emoji' && (
                <>
                  <div className="flex items-center gap-1 overflow-x-auto pb-1 mb-2 scrollbar-hide text-[11px] font-bold">
                    {Object.keys(EMOJI_CATEGORIES).map(cat => (
                      <button
                        key={cat}
                        type="button"
                        onClick={() => setActiveEmojiCat(cat)}
                        className={`px-2.5 py-0.5 rounded-full flex-shrink-0 transition-all ${
                          activeEmojiCat === cat ? 'bg-sky-50 text-sky-600 border border-sky-200' : 'text-slate-500'
                        }`}
                      >
                        {cat}
                      </button>
                    ))}
                  </div>
                  <div className="grid grid-cols-8 gap-1.5 max-h-40 overflow-y-auto scrollbar-hide p-1">
                    {EMOJI_CATEGORIES[activeEmojiCat]?.map((item) => (
                      <button
                        key={item}
                        type="button"
                        onClick={() => appendEmoji(item)}
                        className="text-2xl aspect-square rounded-xl hover:bg-sky-50 active:scale-90 transition-all flex items-center justify-center"
                      >
                        {item}
                      </button>
                    ))}
                  </div>
                </>
              )}

              {pickerTab === 'sticker' && (
                <>
                  <div className="flex items-center gap-1 overflow-x-auto pb-1 mb-2 scrollbar-hide text-[11px] font-bold">
                    {Object.keys(STICKER_PACKS).map(pack => (
                      <button
                        key={pack}
                        type="button"
                        onClick={() => setActiveStickerPack(pack)}
                        className={`px-2.5 py-0.5 rounded-full flex-shrink-0 transition-all ${
                          activeStickerPack === pack ? 'bg-sky-50 text-sky-600 border border-sky-200' : 'text-slate-500'
                        }`}
                      >
                        {pack}
                      </button>
                    ))}
                  </div>
                  <div className="grid grid-cols-6 sm:grid-cols-8 gap-2 max-h-40 overflow-y-auto scrollbar-hide p-1">
                    {STICKER_PACKS[activeStickerPack]?.map((item) => (
                      <button
                        key={item}
                        type="button"
                        onClick={() => handleSendSticker(item)}
                        className="text-3xl aspect-square rounded-2xl hover:bg-sky-50 active:scale-90 transition-all flex items-center justify-center"
                      >
                        {item}
                      </button>
                    ))}
                  </div>
                </>
              )}

              {/* GIF Tab with Search */}
              {pickerTab === 'gif' && (
                <div className="space-y-2">
                  <div className="relative">
                    <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                    <input
                      type="text"
                      value={gifSearchQuery}
                      onChange={(e) => setGifSearchQuery(e.target.value)}
                      placeholder="Search any GIF (powered by Giphy)..."
                      className="w-full h-9 pl-9 pr-8 text-base font-medium border border-slate-200 rounded-xl bg-slate-50 text-slate-800 outline-none focus:border-sky-400 focus:bg-white transition-colors"
                    />
                    {gifSearchQuery && (
                      <button
                        type="button"
                        onClick={() => setGifSearchQuery('')}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 rounded-full text-slate-400 hover:text-slate-600"
                      >
                        <X size={13} />
                      </button>
                    )}
                  </div>

                  <div className="min-h-0 max-h-48 overflow-y-auto overflow-x-hidden p-1 scrollbar-hide [-webkit-overflow-scrolling:touch]">
                    {isSearchingGifs ? (
                      <div className="flex flex-col items-center justify-center py-8 text-slate-400 text-xs">
                        <Loader2 size={20} className="animate-spin text-sky-500 mb-1.5" />
                        <span>Searching GIFs…</span>
                      </div>
                    ) : (
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                        {gifResults.map((gif) => (
                          <button
                            key={gif.id}
                            type="button"
                            onClick={() => handleSendGif(gif.url)}
                            className="relative w-full h-24 sm:h-28 rounded-xl overflow-hidden bg-slate-100 border border-slate-200/90 active:scale-95 transition-transform group"
                          >
                            <img 
                              src={gif.url} 
                              alt={gif.title} 
                              className="w-full h-full object-cover" 
                              loading="lazy" 
                            />
                            {gif.title && (
                              <span className="absolute bottom-1 left-1 right-1 px-1.5 py-0.5 bg-black/60 backdrop-blur-xs rounded text-[9px] text-white font-semibold truncate text-left pointer-events-none">
                                {gif.title}
                              </span>
                            )}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {replyingTo && (
            <div className="mx-auto mb-2 flex max-w-3xl items-center gap-2 rounded-2xl border border-sky-100 bg-white/95 px-3 py-2 shadow-sm">
              <Reply size={16} className="flex-shrink-0 text-sky-600" />
              <div className="min-w-0 flex-1 border-l-2 border-sky-500 pl-2">
                <p className="truncate text-[11px] font-bold text-sky-700">
                  Replying to {replyingTo.senderId === currentUser.id ? 'yourself' : replyingTo.senderName || 'Roommate'}
                </p>
                <p className="line-clamp-2 whitespace-pre-wrap break-words text-xs leading-snug text-slate-600">
                  {getReplySummary(replyingTo)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setReplyingTo(null)}
                className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                aria-label="Cancel reply"
              >
                <X size={15} />
              </button>
            </div>
          )}

          {/* Input Capsule with onPaste for Keyboard GIFs & Stickers */}
          <form 
            onSubmit={(e) => e.preventDefault()} 
            className="max-w-3xl mx-auto flex items-center gap-1.5 sm:gap-2 p-1.5 sm:p-2 rounded-full bg-white/95 backdrop-blur-2xl border border-white/80 shadow-[0_12px_36px_-6px_rgba(15,23,42,0.12)] transition-all focus-within:ring-2 focus-within:ring-sky-500/20"
          >
            <input
              ref={fileInputRef}
              type="file"
              
              accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.zip"
              onChange={handleFileUpload}
              className="hidden"
            />

            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full text-slate-500 hover:text-sky-600 hover:bg-white active:scale-95 transition-all disabled:opacity-40"
              title="Upload photo, document, video or audio"
            >
              {uploading ? <span className="text-[10px] font-bold text-sky-600 animate-pulse">...</span> : <ImagePlus size={19} />}
            </button>

            <button
              type="button"
              onClick={() => setPickerTab((curr) => curr === 'emoji' ? null : 'emoji')}
              className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full transition-all active:scale-95 ${
                pickerTab === 'emoji' ? 'bg-sky-100 text-sky-700' : 'text-slate-500 hover:text-sky-600 hover:bg-white'
              }`}
              title="Emoji / Stickers / GIFs"
            >
              <Smile size={19} />
            </button>

            <textarea
              ref={messageInputRef}
              value={input}
              onKeyDown={(event) => {
                if (
                  event.key === 'Enter' &&
                  !event.shiftKey &&
                  !event.nativeEvent.isComposing
                ) {
                  event.preventDefault();
                  handleSend();
                }
              }}
              onChange={(e) => {
                setInput(e.target.value);
                updateTypingStatus(e.target.value);
                e.target.style.height = '40px';
                e.target.style.height = `${Math.min(e.target.scrollHeight, 128)}px`;
                e.target.style.overflowY = e.target.scrollHeight > 128 ? 'auto' : 'hidden';
              }}
              onPaste={handleInputPaste}
              placeholder="Type a message..."
              rows={1}
              className="min-h-10 max-h-32 min-w-0 flex-1 resize-none self-center overflow-y-hidden bg-transparent px-2.5 py-2 text-base leading-5 text-slate-800 outline-none placeholder:text-slate-400 font-medium"
            />

            <button
              type="button"
              onClick={() => handleSend()}
              disabled={!input.trim()}
              className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-tr from-sky-500 to-blue-600 text-white shadow-md shadow-sky-500/25 transition-all hover:opacity-95 active:scale-90 disabled:opacity-30 disabled:pointer-events-none"
              aria-label="Send message"
            >
              <Send size={16} className="-mr-0.5" />
            </button>
          </form>
        </div>
      )}

      {/* Clear Chat Confirmation Modal */}
      {showClearConfirm && createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-md animate-in fade-in duration-150">
          <div className="w-full max-w-xs rounded-3xl p-5 bg-white shadow-2xl border border-slate-100 text-center animate-in zoom-in-95 duration-150">
            <div className="w-12 h-12 bg-rose-50 text-rose-600 rounded-2xl flex items-center justify-center mx-auto mb-3">
              <Trash2 size={22} />
            </div>
            <h3 className="text-sm font-bold text-slate-900 mb-1">Clear this conversation?</h3>
            <p className="text-xs text-slate-500 mb-4 leading-relaxed">
              Messages will be cleared from your view in this room space.
            </p>

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setShowClearConfirm(false)}
                disabled={clearing}
                className="py-2.5 rounded-xl border border-slate-200 text-slate-600 font-semibold text-xs hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleClearChatForMe}
                disabled={clearing}
                className="py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs shadow-sm shadow-rose-500/20"
              >
                {clearing ? 'Clearing...' : 'Clear All'}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {disputeResolutionMessage && createPortal(
        <div
          className="fixed inset-0 z-[170] flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-sm"
          onClick={() => {
            setDisputeResolutionMessage(null);
            setDisputeResolutionError('');
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="dispute-resolution-title"
            className="max-h-[min(90dvh,44rem)] w-full max-w-lg overflow-y-auto rounded-3xl border border-white/70 bg-white p-5 shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-4 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 id="dispute-resolution-title" className="text-base font-extrabold text-slate-900">
                  Resolve expense dispute
                </h2>
                <p className="mt-1 truncate text-xs text-slate-500">
                  {disputeResolutionMessage.expenseTitle || 'Disputed expense'}
                </p>
              </div>
              <button
                type="button"
                aria-label="Close dispute resolution"
                onClick={() => {
                  setDisputeResolutionMessage(null);
                  setDisputeResolutionError('');
                }}
                className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-rose-600 text-white hover:bg-rose-700"
              >
                <X size={15} />
              </button>
            </div>

            {disputeResolutionError && (
              <p role="alert" className="mb-3 rounded-xl bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700">
                {disputeResolutionError}
              </p>
            )}

            {disputeResolutionMode === 'choices' && (
              <div className="space-y-2">
                {canEditDisputedExpense && (
                  <button
                    type="button"
                    disabled={resolvingDisputeIds.has(disputeResolutionMessage.id)}
                    onClick={() => {
                      setDisputeResolutionError('');
                      setDisputeResolutionMode('confirm-delete');
                    }}
                    className="flex min-h-12 w-full items-center gap-3 rounded-xl border border-rose-200 bg-rose-50 px-4 text-left text-sm font-bold text-rose-700 hover:bg-rose-100 disabled:opacity-60"
                  >
                    <Trash2 size={17} />
                    Delete transaction
                  </button>
                )}
                {canMarkDisputeSolved && (
                  <button
                    type="button"
                    disabled={resolvingDisputeIds.has(disputeResolutionMessage.id)}
                    onClick={() => handleResolveExpenseDispute(disputeResolutionMessage, 'solved')}
                    className="flex min-h-12 w-full items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 text-left text-sm font-bold text-emerald-700 hover:bg-emerald-100 disabled:opacity-60"
                  >
                    <Check size={17} />
                    {resolvingDisputeIds.has(disputeResolutionMessage.id) ? 'Saving…' : 'Mark as solved'}
                  </button>
                )}
                {canEditDisputedExpense && (
                  <button
                    type="button"
                    disabled={resolvingDisputeIds.has(disputeResolutionMessage.id)}
                    onClick={() => {
                      setDisputeResolutionError('');
                      setDisputeResolutionMode('edit');
                    }}
                    className="flex min-h-12 w-full items-center gap-3 rounded-xl border border-blue-200 bg-blue-50 px-4 text-left text-sm font-bold text-blue-700 hover:bg-blue-100 disabled:opacity-60"
                  >
                    <Receipt size={17} />
                    Update transaction
                  </button>
                )}
              </div>
            )}

            {disputeResolutionMode === 'confirm-delete' && (
              <div>
                <p className="text-sm font-bold text-slate-900">Delete this transaction?</p>
                <p className="mt-1 text-xs text-slate-500">
                  The expense will be removed from the group and the dispute will be resolved.
                </p>
                <div className="mt-4 grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setDisputeResolutionMode('choices')}
                    className="min-h-10 rounded-xl border border-slate-200 text-xs font-semibold text-slate-700"
                  >
                    Back
                  </button>
                  <button
                    type="button"
                    disabled={resolvingDisputeIds.has(disputeResolutionMessage.id)}
                    onClick={() => handleResolveExpenseDispute(disputeResolutionMessage, 'delete')}
                    className="min-h-10 rounded-xl bg-rose-600 text-xs font-bold text-white disabled:opacity-60"
                  >
                    {resolvingDisputeIds.has(disputeResolutionMessage.id) ? 'Deleting…' : 'Delete transaction'}
                  </button>
                </div>
              </div>
            )}

            {disputeResolutionMode === 'edit' && disputeEditForm && (
              <form className="space-y-3" onSubmit={submitDisputeExpenseEdit}>
                <label className="block text-xs font-semibold text-slate-700">
                  Transaction name
                  <input
                    value={disputeEditForm.title}
                    onChange={(event) => setDisputeEditForm((previous) => ({ ...previous, title: event.target.value }))}
                    className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-normal text-slate-900"
                    required
                  />
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <label className="block text-xs font-semibold text-slate-700">
                    Amount ({group.currency || 'currency'})
                    <input
                      type="number"
                      min="0.01"
                      step="0.01"
                      value={disputeEditForm.totalAmount}
                      onChange={(event) => setDisputeEditForm((previous) => ({ ...previous, totalAmount: event.target.value }))}
                      className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-normal text-slate-900"
                      required
                    />
                  </label>
                  <label className="col-span-2 block min-w-0 text-xs font-semibold text-slate-700">
                    Date
                    <input
                      type="date"
                      value={disputeEditForm.date}
                      onChange={(event) => setDisputeEditForm((previous) => ({ ...previous, date: event.target.value }))}
                      className="mt-1 block w-full min-w-0 max-w-full appearance-none rounded-xl border border-slate-200 px-3 py-2 text-base font-normal text-slate-900"
                      required
                    />
                  </label>
                  <label className="block text-xs font-semibold text-slate-700">
                    Paid by
                    <select
                      value={disputeEditForm.paidBy}
                      onChange={(event) => setDisputeEditForm((previous) => ({ ...previous, paidBy: event.target.value }))}
                      className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-normal text-slate-900"
                    >
                      {(group.members || []).map((memberId) => (
                        <option key={memberId} value={memberId}>
                          {memberId === currentUser.id ? 'You' : users.find((member) => member.id === memberId)?.username || 'Member'}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block text-xs font-semibold text-slate-700">
                    Category
                    <select
                      value={disputeEditForm.category}
                      onChange={(event) => setDisputeEditForm((previous) => ({ ...previous, category: event.target.value }))}
                      className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-normal text-slate-900"
                    >
                      {CATEGORIES.map((category) => <option key={category} value={category}>{category}</option>)}
                      {!CATEGORIES.includes(disputeEditForm.category) && (
                        <option value={disputeEditForm.category}>{disputeEditForm.category}</option>
                      )}
                    </select>
                  </label>
                  <label className="block text-xs font-semibold text-slate-700">
                    Payment method
                    <select
                      value={disputeEditForm.paymentMethod}
                      onChange={(event) => setDisputeEditForm((previous) => ({ ...previous, paymentMethod: event.target.value }))}
                      className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-normal text-slate-900"
                    >
                      {PAYMENT_METHODS.map((method) => <option key={method} value={method}>{method}</option>)}
                      {!PAYMENT_METHODS.includes(disputeEditForm.paymentMethod) && (
                        <option value={disputeEditForm.paymentMethod}>{disputeEditForm.paymentMethod}</option>
                      )}
                    </select>
                  </label>
                </div>
                <fieldset className="rounded-xl border border-slate-200 p-3">
                  <legend className="px-1 text-xs font-bold text-slate-700">Member shares</legend>
                  <div className="max-h-40 space-y-2 overflow-y-auto">
                    {(group.members || []).map((memberId) => (
                      <label key={memberId} className="flex items-center justify-between gap-3 text-xs text-slate-600">
                        <span className="min-w-0 truncate">
                          {memberId === currentUser.id ? 'You' : users.find((member) => member.id === memberId)?.username || 'Member'}
                        </span>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={disputeEditForm.splits[memberId] ?? '0'}
                          onChange={(event) => setDisputeEditForm((previous) => ({
                            ...previous,
                            splits: { ...previous.splits, [memberId]: event.target.value },
                          }))}
                          className="w-28 rounded-lg border border-slate-200 px-2 py-1.5 text-right text-xs text-slate-900 outline-none focus:border-slate-200 focus:outline-none focus:ring-0"
                        />
                      </label>
                    ))}
                  </div>
                </fieldset>
                <p className="text-[11px] text-slate-500">
                  Shares must total {formatCurrency(disputeEditForm.totalAmount, group.currency)}.
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setDisputeResolutionMode('choices');
                      setDisputeResolutionError('');
                    }}
                    className="min-h-10 rounded-xl border border-slate-200 text-xs font-semibold text-slate-700"
                  >
                    Back
                  </button>
                  <button
                    type="submit"
                    disabled={resolvingDisputeIds.has(disputeResolutionMessage.id)}
                    className="min-h-10 rounded-xl bg-blue-700 text-xs font-bold text-white disabled:opacity-60"
                  >
                    {resolvingDisputeIds.has(disputeResolutionMessage.id) ? 'Saving…' : 'Save update'}
                  </button>
                </div>
              </form>
            )}
          </section>
        </div>,
        document.body
      )}

      {/* Full-Screen Image Lightbox Modal */}
      {selectedImage && createPortal(
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/90 backdrop-blur-md p-4 animate-in fade-in duration-200"
          role="dialog"
          onClick={() => setSelectedImage(null)}
        >
          <button
            type="button"
            onClick={() => setSelectedImage(null)}
            className="absolute left-4 top-4 inline-flex items-center gap-2 rounded-full bg-white/10 backdrop-blur-md px-4 py-2 text-xs font-bold text-white hover:bg-white/20 transition-all"
          >
            <ArrowLeft size={16} />
            <span>Back</span>
          </button>
          <button
            type="button"
            onClick={() => setSelectedImage(null)}
            className="absolute right-4 top-4 rounded-full bg-white/10 backdrop-blur-md p-2.5 text-white hover:bg-white/20 transition-all"
          >
            <X size={18} />
          </button>
          
          <img
            src={selectedImage.attachmentData}
            alt="Chat full view"
            className="max-h-[85vh] max-w-full rounded-2xl object-contain shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          />
          
          <a
            href={selectedImage.attachmentData}
            download="chat-image"
            onClick={(event) => event.stopPropagation()}
            className="absolute bottom-6 inline-flex items-center gap-2 rounded-2xl bg-white px-5 py-2.5 text-xs font-bold text-slate-900 shadow-xl transition-transform hover:scale-105"
          >
            <Download size={15} /> Download original
          </a>
        </div>,
        document.body
      )}
    </div>
  );
}

function VideoPlayer({ src, mimeType }) {
  const [playbackUrl, setPlaybackUrl] = useState('');
  const [hasPlaybackError, setHasPlaybackError] = useState(false);

  useEffect(() => {
    let objectUrl;
    let isCancelled = false;

    const setSource = async () => {
      try {
        if (src.startsWith('data:')) {
          const response = await fetch(src);
          if (!response.ok) throw new Error('Could not load video data.');
          const videoBlob = await response.blob();
          objectUrl = URL.createObjectURL(new Blob([videoBlob], { type: mimeType || videoBlob.type }));
          if (isCancelled) {
            URL.revokeObjectURL(objectUrl);
            return;
          }
          setPlaybackUrl(objectUrl);
        } else {
          setPlaybackUrl(src);
        }
      } catch (error) {
        console.error('Could not prepare video playback:', error);
        if (!isCancelled) setHasPlaybackError(true);
      }
    };

    void setSource();
    return () => {
      isCancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [src, mimeType]);

  return (
    <>
      <div className="overflow-hidden rounded-2xl border border-white/20 bg-black shadow-sm">
        {playbackUrl ? (
          <video
            src={playbackUrl}
            controls
            playsInline
            preload="metadata"
            className="block aspect-video w-full bg-black object-contain"
            onError={() => setHasPlaybackError(true)}
          >
            Your browser does not support embedded video.
          </video>
        ) : (
          <div className="flex aspect-video w-full items-center justify-center text-xs text-white/70">
            Preparing video...
          </div>
        )}
      </div>
      {hasPlaybackError && (
        <p role="status" className="text-xs text-amber-500 font-semibold pt-1">
          Video format not supported. Download to view.
        </p>
      )}
    </>
  );
}