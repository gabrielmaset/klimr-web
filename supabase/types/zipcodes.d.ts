declare module "zipcodes" {
  export interface ZipRecord {
    zip: string;
    latitude: number;
    longitude: number;
    city: string;
    state: string;
    country: string;
  }
  export const codes: Record<string, ZipRecord>;
  export const states: Record<string, string>;
  export function lookup(zip: string | number): ZipRecord | undefined;
  export function lookupByName(city: string, state?: string): ZipRecord[];
  export function lookupByState(state: string): ZipRecord[];
  export function radius(zip: string | number, miles: number, full?: boolean): string[];
  export function distance(a: string | number, b: string | number): number | null;
  export function lookupByCoords(lat: number, lng: number): ZipRecord | undefined;
}
