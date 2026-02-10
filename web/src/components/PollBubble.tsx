'use client';

import { useState, useEffect } from 'react';
import { BarChart3, Check, Users, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';
import api from '@/lib/api';

interface PollOption {
  id: string;
  text: string;
  votes: number;
  voters: { user_id: string; username: string }[];
  voted: boolean;
}

interface PollData {
  id: string;
  question: string;
  options: PollOption[];
  allow_multiple: boolean;
  is_anonymous: boolean;
  total_votes: number;
  closes_at: string | null;
  is_closed: boolean;
  creator_id: string;
}

interface PollBubbleProps {
  pollId: string;
  isOwn: boolean;
}

export default function PollBubble({ pollId, isOwn }: PollBubbleProps) {
  const [poll, setPoll] = useState<PollData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isVoting, setIsVoting] = useState(false);

  useEffect(() => {
    fetchPoll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pollId]);

  const fetchPoll = async () => {
    try {
      const { data } = await api.get(`/polls/${pollId}`);
      setPoll(data);
    } catch {
      // Silently fail
    } finally {
      setIsLoading(false);
    }
  };

  const handleVote = async (optionId: string) => {
    if (!poll || poll.is_closed || isVoting) return;

    // Check if already voted for this option
    const option = poll.options.find(o => o.id === optionId);
    if (option?.voted && !poll.allow_multiple) return;

    setIsVoting(true);
    try {
      await api.post(`/polls/${pollId}/vote`, { option_id: optionId });
      await fetchPoll(); // Refresh poll data
    } catch {
      // ignore
    } finally {
      setIsVoting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="w-64 p-3 animate-pulse">
        <div className="h-4 bg-[var(--bg-wash)] rounded mb-3 w-3/4" />
        <div className="space-y-2">
          <div className="h-8 bg-[var(--bg-wash)] rounded" />
          <div className="h-8 bg-[var(--bg-wash)] rounded" />
        </div>
      </div>
    );
  }

  if (!poll) return <div className="text-xs text-[var(--text-muted)] p-2">Poll unavailable</div>;

  const hasVoted = poll.options.some(o => o.voted);
  const showResults = hasVoted || poll.is_closed;

  return (
    <div className="w-64 min-w-[240px]">
      {/* Poll icon + question */}
      <div className="flex items-start gap-2 mb-3">
        <BarChart3 className="w-4 h-4 mt-0.5 flex-shrink-0 opacity-70" />
        <p className="text-sm font-medium leading-snug">{poll.question}</p>
      </div>

      {/* Options */}
      <div className="space-y-1.5">
        {poll.options.map(opt => {
          const pct = poll.total_votes > 0 ? Math.round((opt.votes / poll.total_votes) * 100) : 0;
          return (
            <button
              key={opt.id}
              onClick={() => handleVote(opt.id)}
              disabled={poll.is_closed || (hasVoted && !poll.allow_multiple)}
              className={cn(
                'w-full text-left rounded-lg overflow-hidden transition-all relative',
                showResults ? 'cursor-default' : 'cursor-pointer hover:opacity-90',
                opt.voted ? 'ring-1 ring-[var(--accent)]' : ''
              )}
            >
              {/* Background bar */}
              {showResults && (
                <div
                  className={cn(
                    'absolute inset-0 rounded-lg transition-all duration-500',
                    opt.voted
                      ? (isOwn ? 'bg-white/20' : 'bg-[var(--accent-subtle)]')
                      : (isOwn ? 'bg-white/10' : 'bg-[var(--bg-wash)]')
                  )}
                  style={{ width: `${pct}%` }}
                />
              )}
              <div className="relative px-3 py-2 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  {opt.voted && <Check className="w-3.5 h-3.5 flex-shrink-0 text-[var(--accent)]" />}
                  <span className="text-xs truncate">{opt.text}</span>
                </div>
                {showResults && (
                  <span className="text-[10px] font-medium flex-shrink-0 opacity-80">{pct}%</span>
                )}
              </div>
            </button>
          );
        })}
      </div>

      {/* Footer info */}
      <div className="flex items-center justify-between mt-2.5 text-[10px] opacity-60">
        <div className="flex items-center gap-1">
          <Users className="w-3 h-3" />
          <span>{poll.total_votes} vote{poll.total_votes !== 1 ? 's' : ''}</span>
        </div>
        {poll.is_closed ? (
          <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> Closed</span>
        ) : poll.closes_at ? (
          <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> {formatClosingTime(poll.closes_at)}</span>
        ) : null}
        {poll.allow_multiple && <span>Multi-vote</span>}
      </div>
    </div>
  );
}

function formatClosingTime(isoStr: string): string {
  const diff = new Date(isoStr).getTime() - Date.now();
  if (diff <= 0) return 'Closed';
  const hours = Math.floor(diff / 3600000);
  if (hours < 1) return `${Math.floor(diff / 60000)}m left`;
  if (hours < 24) return `${hours}h left`;
  return `${Math.floor(hours / 24)}d left`;
}
