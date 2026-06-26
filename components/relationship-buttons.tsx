import { UserPlus, UserCheck, Check, X, Clock, Rss } from "lucide-react";
import { sendFriendRequest, acceptFriendRequest, removeFriend, followUser, unfollowUser } from "@/app/network/actions";

export type FriendStatus = "none" | "requested" | "incoming" | "friends";

const base = "press inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-semibold transition-colors";
const solid = `${base} bg-ink text-surface hover:bg-ink-soft`;
const outline = `${base} border border-rule text-ink hover:bg-bg`;

export function RelationshipButtons({
  targetId,
  friendStatus,
  isFollowing,
}: {
  targetId: string;
  friendStatus: FriendStatus;
  isFollowing: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {friendStatus === "none" ? (
        <form action={sendFriendRequest}>
          <input type="hidden" name="userId" value={targetId} />
          <button className={solid}><UserPlus size={15} /> Add friend</button>
        </form>
      ) : null}

      {friendStatus === "requested" ? (
        <form action={removeFriend}>
          <input type="hidden" name="userId" value={targetId} />
          <button className={outline} title="Cancel request"><Clock size={15} /> Requested</button>
        </form>
      ) : null}

      {friendStatus === "incoming" ? (
        <>
          <form action={acceptFriendRequest}>
            <input type="hidden" name="userId" value={targetId} />
            <button className={solid}><Check size={15} /> Accept friend</button>
          </form>
          <form action={removeFriend}>
            <input type="hidden" name="userId" value={targetId} />
            <button className={outline}><X size={15} /> Decline</button>
          </form>
        </>
      ) : null}

      {friendStatus === "friends" ? (
        <form action={removeFriend}>
          <input type="hidden" name="userId" value={targetId} />
          <button className={`${outline} text-success`} title="Remove friend"><UserCheck size={15} /> Friends</button>
        </form>
      ) : null}

      {isFollowing ? (
        <form action={unfollowUser}>
          <input type="hidden" name="userId" value={targetId} />
          <button className={outline}><UserCheck size={15} /> Following</button>
        </form>
      ) : (
        <form action={followUser}>
          <input type="hidden" name="userId" value={targetId} />
          <button className={outline}><Rss size={15} /> Follow</button>
        </form>
      )}
    </div>
  );
}
