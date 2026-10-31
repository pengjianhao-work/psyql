import React from 'react';
import { VideoItem } from '../types';

interface VideoCardProps {
  video: VideoItem;
  compact?: boolean;
}

function formatDuration(seconds?: number): string | null {
  if (!seconds || seconds <= 0) return null;
  const minutes = Math.floor(seconds / 60);
  const rest = Math.floor(seconds % 60);
  return `${minutes}:${String(rest).padStart(2, '0')}`;
}

export const VideoCard: React.FC<VideoCardProps> = ({ video, compact = false }) => {
  const duration = formatDuration(video.durationSec);

  return (
    <article className={`video-card${compact ? ' video-card-compact' : ''}`}>
      <div className="video-card-thumb" aria-hidden="true">
        🎬
      </div>
      <div className="video-card-body">
        <div className="video-card-meta">
          <span className="video-card-platform">抖音</span>
          {video.isPlaceholder && <span className="video-card-badge">示例</span>}
          {duration && <span className="video-card-duration">{duration}</span>}
        </div>
        <h5 className="video-card-title">{video.title}</h5>
        {!compact && video.description && <p className="video-card-desc">{video.description}</p>}
        {video.tags.length > 0 && (
          <div className="video-card-tags">
            {video.tags.slice(0, 3).map((tag) => (
              <span key={tag} className="video-card-tag">
                {tag}
              </span>
            ))}
          </div>
        )}
        <div className="video-card-footer">
          <span className="video-card-author">{video.author}</span>
          <a
            className="video-card-link"
            href={video.url}
            target="_blank"
            rel="noopener noreferrer"
          >
            去抖音观看 →
          </a>
        </div>
      </div>
    </article>
  );
};
