import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
import { messageService } from '../../services/messageService';
import { tradeService } from '../../services/tradeService';
import { Conversation, Message, TradeOffer } from '../../types';
import { tradeStatusLabel } from '../../utils/tradeStatus';
import { ArrowLeft, Send, ArrowLeftRight } from 'lucide-react';

export const MessagesPage: React.FC = () => {
  const { id } = useParams<{ id?: string }>();
  const navigate = useNavigate();
  const { currentUser, showToast } = useApp();

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [isLoadingConvs, setIsLoadingConvs] = useState(true);
  const [selectedConvId, setSelectedConvId] = useState<string | undefined>(id);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [inputText, setInputText] = useState('');
  // Sohbetin bağlı olduğu takas (rapor md. 33). Swaloop'ta mesajlaşma
  // sosyal sohbet değil, takas bağlamlı bir kanaldır: konuşmanın üstünde
  // hangi takasın konuşulduğu her zaman görünür.
  const [activeTrade, setActiveTrade] = useState<TradeOffer | undefined>(undefined);

  const activeConv = conversations.find((c) => c.id === selectedConvId) || conversations[0];

  const refreshConversations = React.useCallback(async () => {
    const convs = await messageService.getConversations(currentUser.id);
    setConversations(convs);
    return convs;
  }, [currentUser.id]);

  // İlk yükleme: konuşma listesini çek. URL'de bir :id varsa onu seçili yap,
  // yoksa listedeki ilk konuşmayı seç.
  useEffect(() => {
    let cancelled = false;
    setIsLoadingConvs(true);
    refreshConversations().then((convs) => {
      if (cancelled) return;
      setIsLoadingConvs(false);
      if (!selectedConvId) {
        setSelectedConvId(id || convs[0]?.id);
      }
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshConversations]);

  useEffect(() => {
    let cancelled = false;

    if (!activeConv?.activeTradeId) {
      setActiveTrade(undefined);
      return;
    }

    tradeService.getTradeById(activeConv.activeTradeId).then((offer) => {
      if (!cancelled) setActiveTrade(offer);
    });

    return () => {
      cancelled = true;
    };
  }, [activeConv?.activeTradeId]);

  useEffect(() => {
    if (!activeConv) {
      setMessages([]);
      return;
    }
    let cancelled = false;
    setIsLoadingMessages(true);
    messageService.getMessages(activeConv.id).then((msgs) => {
      if (cancelled) return;
      setMessages(msgs);
      setIsLoadingMessages(false);
    });
    messageService.markConversationRead(activeConv.id, currentUser.id);
    return () => {
      cancelled = true;
    };
  }, [selectedConvId, activeConv, currentUser.id]);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    const text = inputText.trim();
    if (!text || !activeConv) return;

    setInputText('');
    const newMsg = await messageService.sendMessage(activeConv.id, currentUser.id, text, 'text');
    if (newMsg) {
      setMessages((prev) => [...prev, newMsg]);
      refreshConversations();
    } else {
      showToast('Mesaj gönderilemedi', 'Lütfen tekrar deneyin.', 'error');
    }
  };

  const sendQuickTemplate = async (text: string) => {
    if (!activeConv) return;
    const newMsg = await messageService.sendMessage(activeConv.id, currentUser.id, text, 'text');
    if (newMsg) {
      setMessages((prev) => [...prev, newMsg]);
      refreshConversations();
    } else {
      showToast('Mesaj gönderilemedi', 'Lütfen tekrar deneyin.', 'error');
    }
  };

  const showList = !selectedConvId || !id;

  return (
    <div className="sw-screen pb-24">
      <div className="sw-container pt-3">
        <div className="sw-card overflow-hidden flex flex-col md:flex-row min-h-[75vh]">
          {/* Sohbet listesi */}
          <div
            className={`w-full md:w-72 md:border-r border-line flex flex-col ${
              showList ? 'flex' : 'hidden md:flex'
            }`}
          >
            <div className="px-4 h-14 flex items-center justify-between border-b border-line">
              <h1 className="text-base text-ink">Mesajlar</h1>
              <span className="text-xs text-ink-faint">{conversations.length} sohbet</span>
            </div>

            <div className="overflow-y-auto flex-1">
              {isLoadingConvs && (
                <div className="p-4 space-y-2">
                  {[0, 1, 2].map((i) => (
                    <div key={i} className="sw-skeleton h-14" />
                  ))}
                </div>
              )}

              {!isLoadingConvs && conversations.length === 0 && (
                <div className="p-8 text-center">
                  <p className="text-sm font-semibold text-ink">Henüz sohbetin yok</p>
                  <p className="text-xs text-ink-soft mt-1">
                    Bir ilana teklif gönderdiğinde ya da mesaj yazdığında sohbet burada açılır.
                  </p>
                  <button
                    type="button"
                    onClick={() => navigate('/kesfet')}
                    className="sw-btn sw-btn-primary mt-4"
                  >
                    İlanları keşfet
                  </button>
                </div>
              )}

              {conversations.map((conv) => {
                const isSelected = conv.id === selectedConvId;

                return (
                  <button
                    key={conv.id}
                    type="button"
                    onClick={() => {
                      setSelectedConvId(conv.id);
                      navigate(`/mesajlar/${conv.id}`);
                    }}
                    className={`w-full p-3 flex items-center gap-3 text-left border-b border-line transition-colors cursor-pointer ${
                      isSelected ? 'bg-brand-soft' : 'hover:bg-canvas'
                    }`}
                  >
                    <img
                      src={conv.participant.avatarUrl}
                      alt=""
                      className="w-10 h-10 rounded-full object-cover shrink-0"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold text-ink truncate">
                        {conv.participant.fullName}
                      </span>
                      <span className="block text-xs text-ink-soft truncate mt-0.5">
                        {conv.lastMessage.content}
                      </span>
                    </span>
                    {conv.unreadCount > 0 && (
                      <span className="min-w-5 h-5 px-1.5 rounded-full bg-brand text-white text-[10px] font-bold flex items-center justify-center shrink-0">
                        {conv.unreadCount}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Sohbet */}
          {activeConv ? (
            <div className={`flex-1 flex flex-col ${showList ? 'hidden md:flex' : 'flex'}`}>
              <div className="px-3 h-14 flex items-center gap-2.5 border-b border-line">
                <button
                  type="button"
                  onClick={() => {
                    setSelectedConvId(undefined);
                    navigate('/mesajlar');
                  }}
                  aria-label="Sohbet listesine dön"
                  className="md:hidden w-10 h-10 rounded-xl flex items-center justify-center text-ink-soft cursor-pointer"
                >
                  <ArrowLeft className="w-5 h-5" />
                </button>

                <button
                  type="button"
                  onClick={() => navigate(`/profil/${activeConv.participant.id}`)}
                  className="flex items-center gap-2.5 min-w-0 cursor-pointer"
                >
                  <img
                    src={activeConv.participant.avatarUrl}
                    alt=""
                    className="w-9 h-9 rounded-full object-cover"
                  />
                  <span className="min-w-0 text-left">
                    <span className="block text-sm font-semibold text-ink truncate">
                      {activeConv.participant.fullName}
                    </span>
                    <span className="block text-[11px] text-ink-soft truncate">
                      {activeConv.participant.district || activeConv.participant.city}
                    </span>
                  </span>
                </button>
              </div>

              {/* Takas bağlam kartı (md. 33) */}
              {activeTrade && (
                <button
                  type="button"
                  onClick={() => navigate(`/teklif/${activeTrade.id}`)}
                  className="w-full px-3 py-2.5 bg-brand-soft border-b border-brand-line text-left flex items-center gap-2 hover:bg-[#dcefe4] transition-colors cursor-pointer"
                >
                  <ArrowLeftRight className="w-4 h-4 text-brand-dark shrink-0" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[11px] font-bold text-ink truncate">
                      {activeTrade.offeredListings.map((l) => l.title).join(' + ') || 'Ürün'}
                      {' ↔ '}
                      {activeTrade.requestedListings.map((l) => l.title).join(' + ') || 'Ürün'}
                    </span>
                    <span className="block text-[10px] text-brand-dark">
                      {tradeStatusLabel(activeTrade.status)}
                    </span>
                  </span>
                  <span className="text-[11px] font-bold text-brand-dark shrink-0">Görüntüle →</span>
                </button>
              )}

              {/* Mesajlar */}
              <div className="flex-1 p-4 overflow-y-auto space-y-2.5 bg-canvas">
                {isLoadingMessages && (
                  <p className="text-center text-xs text-ink-faint py-4">Mesajlar yükleniyor…</p>
                )}

                {messages.map((msg) => {
                  const isMe = msg.senderId === currentUser.id;

                  if (msg.type === 'system_card') {
                    return (
                      <div key={msg.id} className="text-center my-2">
                        <span className="inline-block px-3 py-1 rounded-full bg-surface border border-line text-[10px] font-semibold text-ink-soft">
                          {msg.content}
                        </span>
                      </div>
                    );
                  }

                  if (
                    (msg.type === 'trade_card' ||
                      msg.type === 'counter_card' ||
                      msg.type === 'delivery_card') &&
                    msg.tradeOfferId
                  ) {
                    return (
                      <div
                        key={msg.id}
                        className={`max-w-[80%] rounded-2xl p-3 border ${
                          isMe
                            ? 'ml-auto bg-surface border-brand-line'
                            : 'mr-auto bg-surface border-line'
                        }`}
                      >
                        <p className="flex items-center gap-1.5 text-[11px] font-bold text-brand-dark">
                          <ArrowLeftRight className="w-3.5 h-3.5" />
                          {msg.type === 'counter_card'
                            ? 'Karşı teklif'
                            : msg.type === 'delivery_card'
                            ? 'Teslimat güncellemesi'
                            : 'Takas teklifi'}
                        </p>
                        <p className="text-xs text-ink mt-1.5">{msg.content}</p>
                        <button
                          type="button"
                          onClick={() => navigate(`/teklif/${msg.tradeOfferId}`)}
                          className="sw-btn sw-btn-soft sw-btn-block mt-2.5 text-xs"
                          style={{ minHeight: '36px' }}
                        >
                          Teklifi görüntüle
                        </button>
                      </div>
                    );
                  }

                  return (
                    <div
                      key={msg.id}
                      className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}
                    >
                      <div
                        className={`max-w-[80%] px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed ${
                          isMe
                            ? 'bg-brand text-white rounded-br-sm'
                            : 'bg-surface text-ink border border-line rounded-bl-sm'
                        }`}
                      >
                        {msg.content}
                      </div>
                      <span className="text-[10px] text-ink-faint mt-1 px-1">{msg.timestamp}</span>
                    </div>
                  );
                })}
              </div>

              {/* Güvenlik notu (md. 34) — sürekli değil, sohbetin altında bir kez */}
              <p className="px-4 py-1.5 text-[10px] text-ink-faint bg-canvas border-t border-line">
                Swaloop takaslarında para gönderilmez. Ödeme bilgilerini paylaşma.
              </p>

              {/* Hızlı yanıtlar */}
              <div className="px-3 py-2 flex items-center gap-1.5 overflow-x-auto no-scrollbar border-t border-line">
                {['Merhaba, hâlâ mevcut mu?', 'Ne zaman uygunsun?', 'Anlaştık, teşekkürler!'].map(
                  (text) => (
                    <button
                      key={text}
                      type="button"
                      onClick={() => sendQuickTemplate(text)}
                      className="sw-chip shrink-0"
                    >
                      {text}
                    </button>
                  )
                )}
              </div>

              {/* Giriş */}
              <form
                onSubmit={handleSendMessage}
                className="p-3 border-t border-line flex items-center gap-2"
              >
                <input
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  placeholder="Mesaj yaz…"
                  className="sw-input flex-1"
                  aria-label="Mesaj"
                />
                <button
                  type="submit"
                  disabled={!inputText.trim()}
                  aria-label="Gönder"
                  className="sw-btn sw-btn-primary w-12 px-0 shrink-0"
                >
                  <Send className="w-4 h-4" />
                </button>
              </form>
            </div>
          ) : (
            <div className="flex-1 hidden md:flex items-center justify-center p-10 text-center">
              <p className="text-sm text-ink-soft">Soldan bir sohbet seç.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
