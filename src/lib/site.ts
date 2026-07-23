import { TAXONOMY } from "./taxonomy";

export const SITE = {
  title: "범범의 연습장",
  description: "서병범이 일하며 배우고 고민한 내용을 남기는 연습장입니다.",
  url: "https://byeongbumseo.github.io",
  author: "서병범",
  github: "https://github.com/ByeongbumSeo",
  email: "bum4321@naver.com"
};

export const SECTION_LABELS = {
  tech: TAXONOMY.tech.label,
  note: TAXONOMY.note.label,
  diary: TAXONOMY.diary.label
} as const;

export const SECTION_PATHS = {
  tech: TAXONOMY.tech.path,
  note: TAXONOMY.note.path,
  diary: TAXONOMY.diary.path
} as const;
