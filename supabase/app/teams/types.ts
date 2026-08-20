export type TeamCard = {
  id: string;
  name: string;
  sport_key: string;
  city: string | null;
  state: string | null;
  memberCount: number;
  maxSize: number | null;
  joined: boolean;
  joinPolicy: string;
};
