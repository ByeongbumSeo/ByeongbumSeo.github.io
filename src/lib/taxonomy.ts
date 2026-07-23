export const TAXONOMY = {
  tech: {
    label: "Tech",
    path: "/tech/",
    description: "기술의 개념과 동작 원리를 맥락과 함께 정리합니다.",
    categories: [
      {
        slug: "ai",
        label: "AI",
        description: "AI 에이전트와 AI를 활용한 개발 방식을 다룹니다."
      },
      {
        slug: "java",
        label: "Java",
        description: "Java, JVM, Spring과 관련 생태계를 다룹니다."
      },
      {
        slug: "database",
        label: "Database",
        description: "데이터베이스, SQL, 잠금과 성능을 다룹니다."
      },
      {
        slug: "web",
        label: "Web",
        description: "HTTP, API, 캐시와 웹 애플리케이션 통신을 다룹니다."
      },
      {
        slug: "network",
        label: "Network",
        description: "IP, 서브넷, SSH와 네트워크 연결 구조를 다룹니다."
      },
      {
        slug: "linux",
        label: "Linux",
        description: "Linux와 셸 환경의 동작 원리를 다룹니다."
      },
      {
        slug: "git",
        label: "Git",
        description: "Git의 동작과 브랜치 관리 문제를 다룹니다."
      },
      {
        slug: "ide",
        label: "IDE",
        description: "IDE, LSP와 코드 분석 도구의 동작을 다룹니다."
      }
    ]
  },
  note: {
    label: "Notes",
    path: "/notes/",
    description: "필요할 때 다시 찾을 명령어와 도구 사용법을 모읍니다.",
    categories: [
      {
        slug: "ai",
        label: "AI",
        description: "AI 개발 도구의 설정과 사용법을 모읍니다."
      },
      {
        slug: "linux",
        label: "Linux",
        description: "Linux 명령어와 프로세스 관련 노트를 모읍니다."
      },
      {
        slug: "terminal",
        label: "Terminal",
        description: "터미널과 셸 환경 설정을 모읍니다."
      },
      {
        slug: "ide",
        label: "IDE",
        description: "IDE 설정, 단축키와 연동 방법을 모읍니다."
      },
      {
        slug: "git",
        label: "Git",
        description: "Git 명령과 작업 방법을 모읍니다."
      },
      {
        slug: "blog",
        label: "Blog",
        description: "블로그 구축과 운영 방법을 모읍니다."
      },
      {
        slug: "writing",
        label: "Writing",
        description: "Markdown과 문서 작성 참고사항을 모읍니다."
      }
    ]
  },
  diary: {
    label: "Diary",
    path: "/diary/",
    description: "일하며 배우고 생각한 과정과 일상의 기록을 남깁니다.",
    categories: [
      {
        slug: "work-retrospective",
        label: "업무 회고",
        description: "일하면서 겪은 사건, 결정과 배운 점을 돌아봅니다."
      },
      {
        slug: "daily",
        label: "일기",
        description: "개인적인 생각과 일상을 기록합니다."
      },
      {
        slug: "article-notes",
        label: "아티클 노트",
        description: "다른 사람의 글을 읽고 내용과 생각을 정리합니다."
      }
    ]
  }
} as const;

export type PostKind = keyof typeof TAXONOMY;

export function getSection(kind: PostKind) {
  return TAXONOMY[kind];
}

export function getCategory(kind: PostKind, slug: string) {
  return TAXONOMY[kind].categories.find((category) => category.slug === slug);
}

export function isCategoryForKind(kind: PostKind, slug: string) {
  return Boolean(getCategory(kind, slug));
}

export function categoryPath(kind: PostKind, category: string) {
  return `${TAXONOMY[kind].path}${category}/`;
}
