import React, { useEffect, useState } from 'react';
import { VideoItem } from '../types';
import { fetchVideoLibrary } from '../api';
import { VideoCard } from './VideoCard';

const EMOTION_FILTERS: Array<{ value: string; label: string }> = [
  { value: '', label: '全部' },
  { value: 'anxious', label: '焦虑' },
  { value: 'sad', label: '低落' },
  { value: 'lonely', label: '孤独' },
  { value: 'frustrated', label: '挫败' },
  { value: 'angry', label: '愤怒' },
  { value: 'confused', label: '迷茫' }
];

interface VideoCenterDrawerProps {
  open: boolean;
  onClose: () => void;
  /** 最近一次对话识别出的情绪，用于默认筛选 */
  emotion?: string;
}

const FILTERABLE_EMOTIONS = new Set(
  EMOTION_FILTERS.map((item) => item.value).filter((value) => value !== '')
);

export const VideoCenterDrawer: React.FC<VideoCenterDrawerProps> = ({
  open,
  onClose,
  emotion
}) => {
  const [activeEmotion, setActiveEmotion] = useState('');
  const [keyword, setKeyword] = useState('');
  const [videos, setVideos] = useState<VideoItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (open) {
      setActiveEmotion(emotion && FILTERABLE_EMOTIONS.has(emotion) ? emotion : '');
    }
  }, [open, emotion]);

  useEffect(() => {
    if (!open) return;

    let cancelled = false;
    const timer = window.setTimeout(() => {
      setLoading(true);
      setError('');
      fetchVideoLibrary({
        emotion: activeEmotion || undefined,
        q: keyword.trim() || undefined,
        limit: 30
      })
        .then((data) => {
          if (!cancelled) setVideos(data.videos);
        })
        .catch(() => {
          if (!cancelled) setError('视频列表加载失败，请检查后端是否已启动');
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, 250);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [open, activeEmotion, keyword]);

  if (!open) return null;

  return (
    <>
      <button
        type="button"
        className="video-drawer-backdrop"
        aria-label="关闭心理视频"
        onClick={onClose}
      />
      <aside className="video-drawer" aria-label="心理视频推荐">
        <div className="video-drawer-header">
          <div>
            <h3>🎬 心理视频</h3>
            <p>来自抖音的公开心理治愈内容，按情绪为你推荐</p>
          </div>
          <button type="button" className="video-drawer-close" onClick={onClose}>
            ✕
          </button>
        </div>

        <div className="video-drawer-filters">
          {EMOTION_FILTERS.map((item) => (
            <button
              key={item.value || 'all'}
              type="button"
              className={`video-filter-chip${activeEmotion === item.value ? ' active' : ''}`}
              onClick={() => setActiveEmotion(item.value)}
            >
              {item.label}
            </button>
          ))}
        </div>

        <input
          className="video-drawer-search"
          value={keyword}
          onChange={(event) => setKeyword(event.target.value)}
          placeholder="搜索标题或标签，如：学习压力 / 失眠"
          aria-label="搜索心理视频"
        />

        <div className="video-drawer-list">
          {loading && <p className="video-drawer-state">正在加载视频…</p>}
          {!loading && error && <p className="video-drawer-state video-drawer-error">{error}</p>}
          {!loading && !error && videos.length === 0 && (
            <p className="video-drawer-state">没有匹配的视频，换个情绪或关键词试试</p>
          )}
          {!loading &&
            !error &&
            videos.map((video) => <VideoCard key={video.id} video={video} />)}
        </div>

        <p className="video-drawer-note">
          视频为外部内容，仅作情绪调节参考，不替代专业咨询；如有危机请立即联系身边人或拨打心理援助热线。
        </p>
      </aside>
    </>
  );
};
