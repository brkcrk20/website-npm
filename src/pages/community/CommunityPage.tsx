import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
import { communityService } from '../../services/communityService';
import { CommunityPost, CommunityEvent } from '../../types';
import { TrustCard } from '../../components/common/TrustCard';
import {
  Users,
  Heart,
  MessageSquare,
  Calendar,
  MapPin,
  Trophy,
  ArrowLeftRight,
} from 'lucide-react';

export const CommunityPage: React.FC = () => {
  const navigate = useNavigate();
  const { currentUser, showToast } = useApp();
  const [activeTab, setActiveTab] = useState<'stories' | 'events' | 'leaderboard'>('stories');
  const [posts, setPosts] = useState<CommunityPost[]>([]);
  const [isLoadingPosts, setIsLoadingPosts] = useState(true);
  const [events, setEvents] = useState<CommunityEvent[]>(() => communityService.getEvents());

  useEffect(() => {
    let cancelled = false;

    (async () => {
      setIsLoadingPosts(true);
      const data = await communityService.getPosts(currentUser.id);
      if (!cancelled) {
        setPosts(data);
        setIsLoadingPosts(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [currentUser.id]);

  const handleLikePost = async (postId: string) => {
    const updated = await communityService.toggleLikePost(postId, currentUser.id);
    if (updated) {
      setPosts((prev) => prev.map((p) => (p.id === postId ? updated : p)));
    }
  };

  const handleToggleEventAttendance = (eventId: string) => {
    const updated = communityService.toggleEventAttendance(eventId);
    if (updated) {
      setEvents(events.map((e) => (e.id === eventId ? updated : e)));
      showToast(
        updated.isAttending ? 'Etkinliğe Katılımınız Alındı!' : 'Katılım iptal edildi',
        updated.isAttending ? `${updated.title} takviminize eklendi.` : undefined,
        'success'
      );
    }
  };

  const leaderboards = [
    { rank: 1, name: 'Berke Çelik', avatar: currentUser.avatarUrl, trades: 7, isMe: true },
    { rank: 2, name: 'Zeynep Kaya', avatar: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=200', trades: 6 },
    { rank: 3, name: 'Mehmet Demir', avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=200', trades: 5 },
    { rank: 4, name: 'Elif Arslan', avatar: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=200', trades: 4 },
    { rank: 5, name: 'Can Yılmaz', avatar: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=200', trades: 3 },
  ];

  return (
    <div className="min-h-screen bg-canvas pb-28 text-ink">
      <div className="max-w-md md:max-w-2xl lg:max-w-4xl mx-auto px-4 pt-4 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2 mb-0.5">
              <span className="p-1.5 rounded-xl bg-brand text-white">
                <Users className="w-4 h-4" />
              </span>
              <h1 className="text-xl font-bold text-ink tracking-tight">Swaloop Topluluğu</h1>
            </div>
            <p className="text-xs text-ink-soft">Takas hikayeleri, yerel buluşmalar ve lider tablosu</p>
          </div>
        </div>

        {/* Tab Controls */}
        <div className="flex items-center gap-1.5 p-1 bg-line/60 rounded-2xl">
          <button
            type="button"
            onClick={() => setActiveTab('stories')}
            className={`flex-1 py-2 rounded-xl text-xs font-bold transition-all ${
              activeTab === 'stories' ? 'bg-surface text-brand-dark shadow-xs' : 'text-ink-soft hover:text-ink'
            }`}
          >
            Takas Hikayeleri
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('events')}
            className={`flex-1 py-2 rounded-xl text-xs font-bold transition-all ${
              activeTab === 'events' ? 'bg-surface text-brand-dark shadow-xs' : 'text-ink-soft hover:text-ink'
            }`}
          >
            Etkinlikler ({events.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('leaderboard')}
            className={`flex-1 py-2 rounded-xl text-xs font-bold transition-all ${
              activeTab === 'leaderboard' ? 'bg-surface text-brand-dark shadow-xs' : 'text-ink-soft hover:text-ink'
            }`}
          >
            Lider Tablosu
          </button>
        </div>

        {/* 1. Stories Tab */}
        {activeTab === 'stories' && isLoadingPosts && (
          <div className="py-16 text-center text-xs text-ink-soft">Gönderiler yükleniyor...</div>
        )}

        {activeTab === 'stories' && !isLoadingPosts && posts.length === 0 && (
          <div className="py-16 text-center text-xs text-ink-soft">Henüz hiç gönderi yok.</div>
        )}

        {activeTab === 'stories' && !isLoadingPosts && posts.length > 0 && (
          <div className="space-y-4">
            {posts.map((post) => (
              <div
                key={post.id}
                className="bg-surface rounded-3xl border border-line p-5 shadow-xs space-y-3"
              >
                {/* Author Info */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <img
                      src={post.author.avatarUrl}
                      alt={post.author.fullName}
                      className="w-10 h-10 rounded-full object-cover border border-line"
                    />
                    <div>
                      <h3 className="text-xs font-bold text-ink">{post.author.fullName}</h3>
                      <span className="text-[10px] text-ink-faint">
                        {post.author.district}, {post.author.city} • {post.createdAt}
                      </span>
                    </div>
                  </div>
                  <TrustCard trustProfile={post.author.trustProfile} variant="compact" />
                </div>

                {/* Content */}
                <div>
                  <h4 className="text-sm font-bold text-ink mb-1">{post.title}</h4>
                  <p className="text-xs text-ink-soft leading-relaxed">{post.content}</p>
                </div>

                {/* Trade Story Highlight Box */}
                {post.tradeStory && (
                  <div className="p-3 rounded-2xl bg-canvas border border-line flex items-center gap-2 text-xs">
                    <span className="font-semibold text-ink">{post.tradeStory.itemGiven}</span>
                    <ArrowLeftRight className="w-3.5 h-3.5 text-brand-dark shrink-0" />
                    <span className="font-semibold text-ink">{post.tradeStory.itemReceived}</span>
                  </div>
                )}

                {/* Images */}
                {post.images && post.images.length > 0 && (
                  <div className="aspect-video rounded-2xl overflow-hidden bg-canvas">
                    <img src={post.images[0]} alt="Hikaye Fotoğrafı" className="w-full h-full object-cover" />
                  </div>
                )}

                {/* Footer buttons */}
                <div className="flex items-center justify-between pt-2 border-t border-line text-xs text-ink-soft">
                  <div className="flex items-center gap-4">
                    <button
                      type="button"
                      onClick={() => handleLikePost(post.id)}
                      className={`flex items-center gap-1 font-semibold transition-colors cursor-pointer ${
                        post.isLiked ? 'text-danger' : 'text-ink-soft hover:text-danger'
                      }`}
                    >
                      <Heart className={`w-4 h-4 ${post.isLiked ? 'fill-rose-500 text-danger' : ''}`} />
                      <span>{post.likesCount}</span>
                    </button>
                    <button
                      type="button"
                      className="flex items-center gap-1 text-ink-soft hover:text-ink font-semibold"
                    >
                      <MessageSquare className="w-4 h-4" />
                      <span>{post.commentsCount}</span>
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* 2. Events Tab */}
        {activeTab === 'events' && (
          <div className="space-y-4">
            {events.map((event) => (
              <div
                key={event.id}
                className="bg-surface rounded-3xl border border-line overflow-hidden shadow-xs"
              >
                <div className="aspect-video sm:aspect-21/9 relative bg-stone-900">
                  <img src={event.imageUrl} alt={event.title} className="w-full h-full object-cover opacity-90" />
                  <div className="absolute top-3 left-3 bg-brand/90 text-white text-[10px] font-bold px-2.5 py-1 rounded-full uppercase tracking-wider">
                    {event.category === 'swap_party' ? 'Takas Partisi' : 'Tamir Kafesi'}
                  </div>
                </div>

                <div className="p-5 space-y-3">
                  <div>
                    <h3 className="text-base font-bold text-ink">{event.title}</h3>
                    <p className="text-xs text-ink-soft leading-relaxed mt-1">{event.description}</p>
                  </div>

                  <div className="space-y-1.5 text-xs text-ink-soft bg-canvas p-3 rounded-2xl">
                    <div className="flex items-center gap-2">
                      <Calendar className="w-4 h-4 text-brand-dark shrink-0" />
                      <span>{event.date} • {event.time}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <MapPin className="w-4 h-4 text-brand-dark shrink-0" />
                      <span>{event.locationName} ({event.district}, {event.city})</span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-2">
                    <span className="text-xs text-ink-soft font-semibold">
                      {event.attendeesCount} kişi katılıyor
                    </span>
                    <button
                      type="button"
                      onClick={() => handleToggleEventAttendance(event.id)}
                      className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                        event.isAttending
                          ? 'bg-brand-soft text-brand-dark border border-brand-line'
                          : 'bg-brand text-white hover:bg-brand-dark shadow-xs'
                      }`}
                    >
                      {event.isAttending ? '✓ Katılıyorsun' : 'Katıl & Takvime Ekle'}
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* 3. Leaderboard Tab */}
        {activeTab === 'leaderboard' && (
          <div className="bg-surface rounded-3xl border border-line p-5 space-y-4 shadow-xs">
            <div className="flex items-center justify-between pb-2 border-b border-line">
              <div className="flex items-center gap-2">
                <Trophy className="w-5 h-5 text-star" />
                <h3 className="text-sm font-bold text-ink">Ayın En Çok Takas Yapanları</h3>
              </div>
              <span className="text-xs text-ink-faint">İstanbul / Kadıköy</span>
            </div>

            <div className="space-y-2">
              {leaderboards.map((user) => (
                <div
                  key={user.rank}
                  className={`p-3 rounded-2xl flex items-center justify-between border transition-all ${
                    user.isMe
                      ? 'bg-brand-soft/80 border-brand-line ring-2 ring-brand'
                      : 'bg-canvas border-line'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span
                      className={`w-6 h-6 rounded-full flex items-center justify-center font-black text-xs ${
                        user.rank === 1
                          ? 'bg-amber-400 text-warn'
                          : user.rank === 2
                          ? 'bg-line text-ink'
                          : user.rank === 3
                          ? 'bg-amber-700 text-white'
                          : 'text-ink-faint'
                      }`}
                    >
                      {user.rank}
                    </span>
                    <img
                      src={user.avatar}
                      alt={user.name}
                      className="w-10 h-10 rounded-full object-cover border border-line"
                    />
                    <div>
                      <h4 className="text-xs font-bold text-ink">
                        {user.name} {user.isMe && '(Sen)'}
                      </h4>
                      <span className="text-[10px] text-ink-soft">{user.trades} başarılı takas</span>
                    </div>
                  </div>

                  <div className="text-right">
                    <span className="text-sm font-extrabold text-brand-dark block">
                      {user.trades}
                    </span>
                    <span className="text-[9px] text-ink-faint uppercase">Takas</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
