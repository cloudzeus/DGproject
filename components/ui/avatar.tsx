import Image from 'next/image';
import { cn, getInitials } from '@/lib/utils';
import type { User } from '@/types';

interface Props {
  user: Pick<User, 'name' | 'avatarUrl'>;
  size?: 'xs' | 'sm' | 'md' | 'lg';
  showPresence?: boolean;
  className?: string;
}

const sizeMap = {
  xs: 'h-6 w-6 text-[10px]',
  sm: 'h-8 w-8 text-xs',
  md: 'h-10 w-10 text-sm',
  lg: 'h-12 w-12 text-base',
};

export function Avatar({ user, size = 'sm', showPresence, className }: Props) {
  const initials = getInitials(user.name);
  const colors = ['bg-fluent-blue-500','bg-fluent-accent-purple','bg-fluent-accent-green','bg-fluent-accent-orange','bg-fluent-accent-teal','bg-fluent-accent-pink'];
  const colorIdx = user.name.charCodeAt(0) % colors.length;

  return (
    <div className={cn('relative inline-flex', className)}>
      <div className={cn(
        'rounded-full flex items-center justify-center font-semibold text-white overflow-hidden ring-2 ring-white',
        sizeMap[size],
        !user.avatarUrl && colors[colorIdx],
      )}>
        {user.avatarUrl ? (
          <Image src={user.avatarUrl} alt={user.name} width={48} height={48} className="object-cover w-full h-full" />
        ) : (
          initials
        )}
      </div>
      {showPresence && (
        <span className={cn(
          'absolute bottom-0 right-0 rounded-full ring-2 ring-white bg-fluent-accent-green',
          size === 'xs' && 'h-1.5 w-1.5',
          size === 'sm' && 'h-2 w-2',
          size === 'md' && 'h-2.5 w-2.5',
          size === 'lg' && 'h-3 w-3',
        )} />
      )}
    </div>
  );
}

export function AvatarStack({ users, max = 3, size = 'sm' }: { users: Pick<User,'name'|'avatarUrl'>[]; max?: number; size?: 'xs'|'sm'|'md' }) {
  const shown = users.slice(0, max);
  const extra = users.length - max;
  return (
    <div className="flex -space-x-2">
      {shown.map((u, i) => (
        <Avatar key={i} user={u} size={size} />
      ))}
      {extra > 0 && (
        <div className={cn(
          'rounded-full ring-2 ring-white bg-fluent-neutral-10 text-fluent-neutral-70 flex items-center justify-center font-semibold',
          size === 'xs' && 'h-6 w-6 text-[10px]',
          size === 'sm' && 'h-8 w-8 text-xs',
          size === 'md' && 'h-10 w-10 text-sm',
        )}>+{extra}</div>
      )}
    </div>
  );
}
