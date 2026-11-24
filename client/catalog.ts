import type { Film, FreeFilm } from './types';

export const img = (path: string | null | undefined, size = 'w500') =>
  path ? (path.startsWith('http') ? path : `https://image.tmdb.org/t/p/${size}${path}`) : '';

export const title = (film: Film) => film.title || film.name || 'Untitled';

export const isAnimeFilm = (film: Film) =>
  (film.genre_ids?.includes(16) || film.genres?.some(g => g.id === 16)) &&
  (film.original_language === 'ja' || film.origin_country?.includes('JP'));

export async function api<T = any>(path: string): Promise<T> {
  const response = await fetch('/api/tmdb/' + path.replace(/^\/+/, ''));
  if (!response.ok) throw new Error('Could not connect to the movie service');
  return response.json();
}

export const baseFreeFilms: FreeFilm[] = [
  {
    id: 'night-of-the-living-dead-1968',
    tmdbId: 10331,
    posterPath: '/rb2NWyb008u1EcKCOyXs2Nmj0ra.jpg',
    title: 'Night of the Living Dead',
    year: 1968,
    description: 'George A. Romero’s 1968 independently produced horror feature in a restored transfer.',
    itemUrl: 'https://archive.org/details/NightOfTheLivingDead1968-Restored',
    videoUrl: 'https://archive.org/download/NightOfTheLivingDead1968-Restored/Notld1968Restoration-desktop.mp4',
    fallbackUrls: ['https://archive.org/download/NightOfTheLivingDead1968-Restored/Notld1968Restoration-desktop_512kb.mp4'],
    playerType: 'mp4',
    provider: 'Internet Archive',
    rightsLabel: 'Public Domain Mark 1.0 · Internet Archive item',
    rightsUrl: 'https://creativecommons.org/publicdomain/mark/1.0/',
    rightsNote: 'The Internet Archive item identifies this 1968 film with Creative Commons Public Domain Mark 1.0 and lists a 95-minute, 50-second runtime. Territorial privacy, publicity, and trademark restrictions may still apply.',
    attribution: 'Night of the Living Dead (1968), George A. Romero. Restored transfer from the linked Internet Archive item.',
    runtimeSeconds: 5750,
    completeness: 'complete',
    contentType: 'feature',
    sourceVerified: true,
    streamCodec: 'avc1+mp4a',
    moovPosition: 'start',
    availableQualities: ['480p MP4', '240p MP4'],
    qualitySources: [
      { label: '480p', url: 'https://archive.org/download/NightOfTheLivingDead1968-Restored/Notld1968Restoration-desktop.mp4' },
      { label: '240p', url: 'https://archive.org/download/NightOfTheLivingDead1968-Restored/Notld1968Restoration-desktop_512kb.mp4' }
    ],
    subtitles: [
      { label: 'English (Auto-captions)', lang: 'en', url: 'https://archive.org/download/NightOfTheLivingDead1968-Restored/Notld1968Restoration-desktop.asr.srt' }
    ],
    countryRestrictions: [],
    excerpts: [{ label: 'Opening', start: 0, end: 30 }, { label: 'Midpoint', start: 2875, end: 2905 }, { label: 'Finale', start: 5680, end: 5710 }]
  },
  {
    id: 'his-girl-friday-1940',
    tmdbId: 3085,
    posterPath: '/lu86Y9zTPH3neCiUzLzHCEFHf7f.jpg',
    title: 'His Girl Friday',
    year: 1940,
    description: 'Howard Hawks’ 1940 Columbia Pictures screwball comedy feature.',
    itemUrl: 'https://archive.org/details/HisGirlFriday',
    videoUrl: 'https://archive.org/download/HisGirlFriday/MoviePowderPresentsHisGirlFriday.mp4',
    fallbackUrls: ['https://archive.org/download/HisGirlFriday/MoviePowderPresentsHisGirlFriday_512kb.mp4'],
    playerType: 'mp4',
    provider: 'Internet Archive',
    rightsLabel: 'Public Domain Mark · Internet Archive item',
    rightsUrl: 'https://creativecommons.org/licenses/publicdomain/',
    rightsNote: 'The Internet Archive item records this feature as public domain and lists a runtime of 1:28:12. Verify territorial restrictions before reuse.',
    attribution: 'His Girl Friday (1940), Howard Hawks, Columbia Pictures. Internet Archive copy.',
    runtimeSeconds: 5292,
    completeness: 'complete',
    contentType: 'feature',
    sourceVerified: true,
    streamCodec: 'avc1+mp4a',
    moovPosition: 'start',
    availableQualities: ['480p MP4', '240p MP4'],
    qualitySources: [
      { label: '480p', url: 'https://archive.org/download/HisGirlFriday/MoviePowderPresentsHisGirlFriday.mp4' },
      { label: '240p', url: 'https://archive.org/download/HisGirlFriday/MoviePowderPresentsHisGirlFriday_512kb.mp4' }
    ],
    countryRestrictions: [],
    excerpts: [{ label: 'Opening', start: 0, end: 30 }, { label: 'Midpoint', start: 2646, end: 2676 }, { label: 'Finale', start: 5220, end: 5250 }]
  },
  {
    id: 'house-on-haunted-hill-1959',
    tmdbId: 15856,
    posterPath: '/g5kdFt3piV3w1pG65W9sSToJ7HB.jpg',
    title: 'House on Haunted Hill',
    year: 1959,
    description: 'William Castle’s 1959 mystery horror classic starring Vincent Price.',
    itemUrl: 'https://archive.org/details/house_on_haunted_hill_ipod',
    videoUrl: 'https://archive.org/download/house_on_haunted_hill_ipod/house_on_haunted_hill.mp4',
    fallbackUrls: ['https://archive.org/download/house_on_haunted_hill_ipod/house_on_haunted_hill_512kb.mp4'],
    playerType: 'mp4',
    provider: 'Internet Archive',
    rightsLabel: 'Public Domain Mark · Internet Archive item',
    rightsUrl: 'https://creativecommons.org/licenses/publicdomain/',
    rightsNote: 'The Internet Archive item identifies this 1959 feature as public domain with a complete runtime of 1:14:43. Verify territorial restrictions before reuse.',
    attribution: 'House on Haunted Hill (1959), directed by William Castle. Internet Archive MP4 copy.',
    runtimeSeconds: 4483,
    completeness: 'complete',
    contentType: 'feature',
    sourceVerified: true,
    streamCodec: 'avc1+mp4a',
    moovPosition: 'start',
    availableQualities: ['480p MP4', '240p MP4'],
    qualitySources: [
      { label: '480p', url: 'https://archive.org/download/house_on_haunted_hill_ipod/house_on_haunted_hill.mp4' },
      { label: '240p', url: 'https://archive.org/download/house_on_haunted_hill_ipod/house_on_haunted_hill_512kb.mp4' }
    ],
    subtitles: [
      { label: 'English (Auto-captions)', lang: 'en', url: 'https://archive.org/download/house_on_haunted_hill_ipod/house_on_haunted_hill.asr.srt' }
    ],
    countryRestrictions: [],
    excerpts: [{ label: 'Opening', start: 0, end: 30 }, { label: 'Midpoint', start: 2240, end: 2270 }, { label: 'Finale', start: 4420, end: 4450 }]
  },
  {
    id: 'carnival-of-souls-1962',
    tmdbId: 16093,
    posterPath: '/9ddPGH7kMe81xznwIKCt17VFUPi.jpg',
    title: 'Carnival of Souls',
    year: 1962,
    description: 'Herk Harvey’s 1962 independent psychological horror feature.',
    itemUrl: 'https://archive.org/details/CarnivalofSouls',
    videoUrl: 'https://archive.org/download/CarnivalofSouls/CarnivalOfSouls.mp4',
    fallbackUrls: ['https://archive.org/download/CarnivalofSouls/CarnivalOfSouls_512kb.mp4'],
    playerType: 'mp4',
    provider: 'Internet Archive',
    rightsLabel: 'Public Domain Mark · Internet Archive item',
    rightsUrl: 'https://creativecommons.org/licenses/publicdomain/',
    rightsNote: 'The Internet Archive item records this 1962 feature as public domain with a complete runtime of 1:23:00. Verify territorial rights before reuse.',
    attribution: 'Carnival of Souls (1962), directed by Herk Harvey. Internet Archive MP4 copy.',
    runtimeSeconds: 4980,
    completeness: 'complete',
    contentType: 'feature',
    sourceVerified: true,
    streamCodec: 'avc1+mp4a',
    moovPosition: 'start',
    availableQualities: ['480p MP4', '240p MP4'],
    qualitySources: [
      { label: '480p', url: 'https://archive.org/download/CarnivalofSouls/CarnivalOfSouls.mp4' },
      { label: '240p', url: 'https://archive.org/download/CarnivalofSouls/CarnivalOfSouls_512kb.mp4' }
    ],
    subtitles: [
      { label: 'English (Auto-captions)', lang: 'en', url: 'https://archive.org/download/CarnivalofSouls/CarnivalOfSouls.asr.srt' }
    ],
    countryRestrictions: [],
    excerpts: [{ label: 'Opening', start: 0, end: 30 }, { label: 'Midpoint', start: 2490, end: 2520 }, { label: 'Finale', start: 4900, end: 4930 }]
  },
  {
    id: 'giant-gila-monster-1959',
    tmdbId: 34077,
    posterPath: '/o7LI2NQ0KtDaVaIYYhZ9PHFDV37.jpg',
    title: 'The Giant Gila Monster',
    year: 1959,
    description: 'Ray Kellogg’s 1959 public-domain creature feature in H.264/AAC browser-compatible transfers.',
    itemUrl: 'https://archive.org/details/giant-gila-monster_202508',
    videoUrl: 'https://archive.org/download/giant-gila-monster_202508/Giant%20Gila%20Monster.ia.mp4',
    fallbackUrls: [
      'https://archive.org/download/giant_gila_monster/giant_gila_monster.mp4',
      'https://archive.org/download/the-giant-gila-monster-1959/The%20Giant%20Gila%20Monster%20(1959).ia.mp4',
      'https://archive.org/download/giant_gila_monster/giant_gila_monster_512kb.mp4'
    ],
    playerType: 'mp4',
    provider: 'Internet Archive',
    rightsLabel: 'Public Domain Mark 1.0 · Internet Archive item',
    rightsUrl: 'https://creativecommons.org/publicdomain/mark/1.0/',
    rightsNote: 'The linked Internet Archive items carry Public Domain Mark 1.0 / Public Domain status with a complete 74-minute runtime in browser-compatible H.264/AAC FastStart MP4 encodings. Territorial restrictions may still apply outside the United States.',
    attribution: 'The Giant Gila Monster (1959), Ray Kellogg. Verified H.264/AAC public-domain transfers from Internet Archive.',
    runtimeSeconds: 4466,
    completeness: 'complete',
    contentType: 'feature',
    sourceVerified: true,
    streamCodec: 'avc1+mp4a',
    moovPosition: 'start',
    availableQualities: ['478p MP4', '1080p MP4', '360p MP4', '240p MP4'],
    qualitySources: [
      { label: '478p (Recommended)', url: 'https://archive.org/download/giant-gila-monster_202508/Giant%20Gila%20Monster.ia.mp4' },
      { label: '1080p HD', url: 'https://archive.org/download/the-giant-gila-monster-1959/The%20Giant%20Gila%20Monster%20(1959).ia.mp4' },
      { label: '360p', url: 'https://archive.org/download/giant_gila_monster/giant_gila_monster.mp4' },
      { label: '240p', url: 'https://archive.org/download/giant_gila_monster/giant_gila_monster_512kb.mp4' }
    ],
    subtitles: [
      { label: 'English (Auto-captions)', lang: 'en', url: 'https://archive.org/download/giant_gila_monster/giant_gila_monster.asr.srt' }
    ],
    countryRestrictions: ['Territorial rights should be verified'],
    excerpts: [{ label: 'Opening', start: 0, end: 30 }, { label: 'Midpoint', start: 2233, end: 2263 }, { label: 'Finale', start: 4400, end: 4430 }]
  },
  {
    id: 'big-buck-bunny-2008',
    tmdbId: 10378,
    posterPath: '/i9jJzvoXET4D9pOkoEwncSdNNER.jpg',
    title: 'Big Buck Bunny',
    year: 2008,
    description: 'Blender Foundation’s 2008 open-movie animated comedy short in adaptive multi-bitrate HLS.',
    itemUrl: 'https://peach.blender.org/',
    videoUrl: 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8',
    fallbackUrls: ['https://archive.org/download/BigBuckBunny_328/BigBuckBunny_512kb.mp4'],
    playerType: 'hls',
    provider: 'Blender Foundation / Mux Open Stream',
    rightsLabel: 'CC BY 3.0 · Blender Foundation',
    rightsUrl: 'https://creativecommons.org/licenses/by/3.0/',
    rightsNote: 'Released by the Blender Foundation (Peach Open Movie Project) under Creative Commons Attribution 3.0.',
    attribution: '(c) copyright 2008, Blender Foundation / www.bigbuckbunny.org (CC BY 3.0).',
    runtimeSeconds: 596,
    completeness: 'complete',
    contentType: 'short',
    sourceVerified: true,
    streamCodec: 'avc1+mp4a (HLS)',
    moovPosition: 'start',
    availableQualities: ['Adaptive HLS (720p/480p/380p/240p)', '240p MP4 Mirror'],
    qualitySources: [
      { label: 'Adaptive HLS (.m3u8)', url: 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8' },
      { label: '240p MP4 Mirror', url: 'https://archive.org/download/BigBuckBunny_328/BigBuckBunny_512kb.mp4' }
    ],
    countryRestrictions: [],
    excerpts: [{ label: 'Opening', start: 0, end: 30 }, { label: 'The Meadow', start: 240, end: 270 }, { label: 'Finale', start: 540, end: 570 }]
  },
  {
    id: 'trip-to-the-moon',
    title: 'A Trip to the Moon',
    year: 1902,
    description: 'A historical silent short by Georges Méliès.',
    itemUrl: 'https://archive.org/details/ATripToTheMoon20Fps',
    videoUrl: 'https://archive.org/download/ATripToTheMoon20Fps/TripToTheMoon20Fps_512kb.mp4',
    fallbackUrls: ['https://archive.org/download/ATripToTheMoon20Fps/TripToTheMoon20Fps.mp4'],
    playerType: 'mp4',
    provider: 'Internet Archive',
    rightsLabel: 'CC BY 3.0 · uploader-declared',
    rightsUrl: 'https://creativecommons.org/licenses/by/3.0/',
    rightsNote: 'The linked Internet Archive item declares CC BY 3.0 for this 20 fps version. Confirm the rights in your territory before reuse.',
    attribution: 'A Trip to the Moon (1902), directed by Georges Méliès. 20 fps version from the linked Internet Archive item; uploader-declared CC BY 3.0.',
    runtimeSeconds: 678,
    completeness: 'complete',
    contentType: 'short',
    sourceVerified: true,
    streamCodec: 'avc1+mp4a',
    moovPosition: 'start',
    availableQualities: ['240p MP4 (FastStart)', '480p MP4'],
    qualitySources: [
      { label: '240p (FastStart)', url: 'https://archive.org/download/ATripToTheMoon20Fps/TripToTheMoon20Fps_512kb.mp4' },
      { label: '480p', url: 'https://archive.org/download/ATripToTheMoon20Fps/TripToTheMoon20Fps.mp4' }
    ],
    excerpts: [{ label: 'Opening', start: 0, end: 30 }, { label: 'The lunar journey', start: 300, end: 330 }, { label: 'The return', start: 630, end: 660 }]
  },
  {
    id: 'great-train-robbery',
    title: 'The Great Train Robbery',
    year: 1903,
    description: 'An early silent film held as a historical motion-picture copy by the Library of Congress.',
    itemUrl: 'https://www.loc.gov/item/00694220/',
    videoUrl: 'https://tile.loc.gov/storage-services/service/mbrs/ntscrm/00000765/00000765.mp4',
    fallbackUrls: ['https://archive.org/download/TheGreatTrainRobbery1903/TheGreatTrainRobbery1903.mp4'],
    playerType: 'mp4',
    provider: 'Library of Congress',
    rightsLabel: 'Rights status and copy completeness require verification',
    rightsUrl: 'https://www.loc.gov/free-to-use/public-domain-films-from-the-national-film-registry/',
    rightsNote: 'Listed by the Library of Congress in its Public Domain Films from the National Film Registry collection; this catalog record describes its available copy as incomplete.',
    attribution: 'The Great Train Robbery (1903), Library of Congress, Motion Picture, Broadcasting and Recorded Sound Division.',
    runtimeSeconds: 714,
    completeness: 'incomplete',
    contentType: 'short',
    sourceVerified: false,
    streamCodec: 'avc1+mp4a',
    moovPosition: 'end',
    availableQualities: ['LOC Archival MP4', 'Archive.org FastStart Mirror'],
    qualitySources: [
      { label: 'LOC Archival MP4', url: 'https://tile.loc.gov/storage-services/service/mbrs/ntscrm/00000765/00000765.mp4' },
      { label: '480p Mirror (FastStart)', url: 'https://archive.org/download/TheGreatTrainRobbery1903/TheGreatTrainRobbery1903.mp4' }
    ],
    excerpts: [{ label: 'Opening', start: 0, end: 30 }, { label: 'The train', start: 300, end: 330 }, { label: 'Finale', start: 660, end: 690 }]
  },
  {
    id: 'may-irwin-kiss',
    title: 'May Irwin Kiss',
    year: 1896,
    description: 'An early silent motion-picture film held by the Library of Congress.',
    itemUrl: 'https://www.loc.gov/item/00694131/',
    videoUrl: 'https://tile.loc.gov/storage-services/service/mbrs/ntscrm/00047798/00047798.mp4',
    playerType: 'mp4',
    provider: 'Library of Congress',
    rightsLabel: 'Rights status requires item-specific verification',
    rightsUrl: 'https://www.loc.gov/free-to-use/public-domain-films-from-the-national-film-registry/',
    rightsNote: 'Listed by the Library of Congress in its Public Domain Films from the National Film Registry collection.',
    attribution: 'May Irwin Kiss (1896), Library of Congress, Motion Picture, Broadcasting and Recorded Sound Division.',
    runtimeSeconds: 30,
    completeness: 'complete',
    contentType: 'short',
    sourceVerified: false,
    streamCodec: 'avc1+mp4a',
    moovPosition: 'end',
    availableQualities: ['LOC Archival MP4'],
    excerpts: [{ label: 'Excerpt 1', start: 0, end: 8 }, { label: 'Excerpt 2', start: 8, end: 18 }, { label: 'Excerpt 3', start: 18, end: 29 }]
  },
  {
    id: 'mckinley-oath',
    title: 'President McKinley Taking the Oath',
    year: 1901,
    description: 'An early silent motion-picture record held by the Library of Congress.',
    itemUrl: 'https://www.loc.gov/item/00694336/',
    videoUrl: 'https://tile.loc.gov/storage-services/service/mbrs/ntscrm/01906619/01906619.mp4',
    playerType: 'mp4',
    provider: 'Library of Congress',
    rightsLabel: 'Rights status requires item-specific verification',
    rightsUrl: 'https://www.loc.gov/free-to-use/public-domain-films-from-the-national-film-registry/',
    rightsNote: 'Listed by the Library of Congress in its Public Domain Films from the National Film Registry collection.',
    attribution: 'President McKinley Taking the Oath (1901), Library of Congress, Motion Picture, Broadcasting and Recorded Sound Division.',
    runtimeSeconds: 44,
    completeness: 'complete',
    contentType: 'short',
    sourceVerified: false,
    streamCodec: 'avc1+mp4a',
    moovPosition: 'end',
    availableQualities: ['LOC Archival MP4'],
    excerpts: [{ label: 'Opening', start: 0, end: 12 }, { label: 'The ceremony', start: 12, end: 28 }, { label: 'Closing', start: 28, end: 43 }]
  },
  {
    id: 'san-francisco-earthquake',
    title: 'San Francisco Earthquake and Fire',
    year: 1906,
    description: 'An early documentary motion-picture record of earthquake and fire damage.',
    itemUrl: 'https://www.loc.gov/item/00694425/',
    videoUrl: 'https://tile.loc.gov/storage-services/service/mbrs/ntscrm/00007947/00007947.mp4',
    playerType: 'mp4',
    provider: 'Library of Congress',
    rightsLabel: 'Rights status requires item-specific verification',
    rightsUrl: 'https://www.loc.gov/free-to-use/public-domain-films-from-the-national-film-registry/',
    rightsNote: 'Listed by the Library of Congress in its Public Domain Films from the National Film Registry collection.',
    attribution: 'San Francisco Earthquake and Fire (1906), Library of Congress, Motion Picture, Broadcasting and Recorded Sound Division.',
    runtimeSeconds: 720,
    completeness: 'complete',
    contentType: 'short',
    sourceVerified: false,
    streamCodec: 'avc1+mp4a',
    moovPosition: 'end',
    availableQualities: ['LOC Archival MP4'],
    excerpts: [{ label: 'Opening', start: 0, end: 30 }, { label: 'Ruins', start: 300, end: 330 }, { label: 'The city', start: 660, end: 690 }]
  },
  {
    id: 'westinghouse-panorama',
    title: 'Panorama of Machine Co. Aisle',
    year: 1904,
    description: 'An early silent motion-picture panorama of a factory aisle.',
    itemUrl: 'https://www.loc.gov/item/96522104/',
    videoUrl: 'https://tile.loc.gov/storage-services/service/mbrs/westhpp/2122/2122.mp4',
    playerType: 'mp4',
    provider: 'Library of Congress',
    rightsLabel: 'Rights status requires item-specific verification',
    rightsUrl: 'https://www.loc.gov/free-to-use/public-domain-films-from-the-national-film-registry/',
    rightsNote: 'Listed by the Library of Congress in its Public Domain Films from the National Film Registry collection.',
    attribution: 'Panorama of Machine Co. Aisle, Westinghouse Co. Works (1904), Library of Congress, Motion Picture, Broadcasting and Recorded Sound Division.',
    runtimeSeconds: 206,
    completeness: 'complete',
    contentType: 'short',
    sourceVerified: false,
    streamCodec: 'avc1+mp4a',
    moovPosition: 'end',
    availableQualities: ['LOC Archival MP4'],
    excerpts: [{ label: 'Opening', start: 0, end: 30 }, { label: 'Factory aisle', start: 80, end: 110 }, { label: 'Closing', start: 170, end: 200 }]
  }
];

export const isHttpUrl = (value: string | undefined) => {
  if (!value) return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch {
    return false;
  }
};

export function validateFreeFilmCatalogEntry(film: FreeFilm): boolean {
  return Boolean(
    film.id.trim() &&
    film.title.trim() &&
    Number.isInteger(film.year) && film.year > 0 &&
    film.description.trim() &&
    isHttpUrl(film.itemUrl) &&
    film.provider.trim() &&
    film.rightsLabel.trim() &&
    isHttpUrl(film.rightsUrl) &&
    film.rightsNote.trim() &&
    film.attribution.trim() &&
    Number.isInteger(film.runtimeSeconds) && film.runtimeSeconds > 0 &&
    film.availableQualities.length > 0 &&
    (film.playerType === 'embed' ? isHttpUrl(film.embedUrl) : isHttpUrl(film.videoUrl))
  );
}

export function isVerifiedFullFeature(film: FreeFilm): boolean {
  const isDirectlyPlayable = film.playerType === 'embed'
    ? isHttpUrl(film.embedUrl)
    : isHttpUrl(film.videoUrl);

  return Boolean(
    validateFreeFilmCatalogEntry(film) &&
    film.sourceVerified &&
    film.completeness === 'complete' &&
    film.contentType === 'feature' &&
    film.runtimeSeconds >= 40 * 60 &&
    isDirectlyPlayable &&
    film.rightsUrl.trim()
  );
}

export const normalizeTitle = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, '');

export function findFreeFilmMatch(film: Film | null | undefined, allFilms: FreeFilm[] = baseFreeFilms): FreeFilm | undefined {
  if (!film || (film.media_type && film.media_type !== 'movie')) return undefined;
  const verified = allFilms.filter(isVerifiedFullFeature);
  const byId = verified.find(entry => entry.tmdbId && entry.tmdbId === film.id);
  if (byId) return byId;

  const filmYear = (film.release_date || '').slice(0, 4);
  if (!/^\d{4}$/.test(filmYear)) return undefined;

  return verified.find(entry =>
    normalizeTitle(entry.title) === normalizeTitle(title(film)) &&
    filmYear === String(entry.year)
  );
}

export function findFreeShortMatch(film: Film | null | undefined, allFilms: FreeFilm[] = baseFreeFilms): FreeFilm | undefined {
  if (!film || (film.media_type && film.media_type !== 'movie')) return undefined;
  const shorts = allFilms.filter(
    entry =>
      validateFreeFilmCatalogEntry(entry) &&
      entry.sourceVerified &&
      entry.contentType === 'short' &&
      isHttpUrl(entry.videoUrl)
  );
  const byId = shorts.find(entry => entry.tmdbId && entry.tmdbId === film.id);
  if (byId) return byId;
  const filmYear = (film.release_date || '').slice(0, 4);
  if (!/^\d{4}$/.test(filmYear)) return undefined;
  return shorts.find(entry =>
    normalizeTitle(entry.title) === normalizeTitle(title(film)) &&
    filmYear === String(entry.year)
  );
}

export function formatRuntime(runtimeSeconds: number): string {
  const safe = Math.max(0, Math.floor(runtimeSeconds));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const seconds = safe % 60;
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
    : `${minutes}:${String(seconds).padStart(2, '0')}`;
}

export function formatBytes(bytes: number | undefined): string {
  if (!bytes || bytes <= 0) return '';
  const mb = bytes / (1024 * 1024);
  return mb >= 1024 ? `${(mb / 1024).toFixed(2)} GB` : `${Math.round(mb)} MB`;
}
