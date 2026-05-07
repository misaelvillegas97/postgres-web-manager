import { DOCUMENT } from '@angular/common';
import { inject, Injectable } from '@angular/core';
import { Meta, Title } from '@angular/platform-browser';
import {
  ActivatedRouteSnapshot,
  RouterStateSnapshot,
  TitleStrategy,
} from '@angular/router';
import { SEO_SITE, SeoBreadcrumb, SeoData } from './seo.config';

const INDEX_ROBOTS =
  'index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1';

@Injectable()
export class SeoTitleStrategy extends TitleStrategy {
  private readonly titleService = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);

  override updateTitle(snapshot: RouterStateSnapshot): void {
    const route = this.getDeepestRoute(snapshot.root);
    const seo = this.getSeoData(route);
    const title =
      seo?.title ?? this.buildTitle(snapshot) ?? SEO_SITE.defaultTitle;
    const description = seo?.description ?? SEO_SITE.description;
    const canonicalPath =
      seo?.canonicalPath ?? this.normalizePath(snapshot.url);
    const canonicalUrl = this.absoluteUrl(canonicalPath);
    const imageUrl = this.absoluteUrl(seo?.imagePath ?? SEO_SITE.imagePath);
    const imageAlt = seo?.imageAlt ?? SEO_SITE.imageAlt;

    this.titleService.setTitle(title);
    this.setName('description', description);
    this.setName('robots', seo?.robots ?? INDEX_ROBOTS);
    this.setName(
      'keywords',
      seo?.keywords.join(', ') ?? 'PostgreSQL, SQL editor, database gateway',
    );
    this.setName('author', SEO_SITE.name);
    this.setName('application-name', SEO_SITE.name);
    this.setName('theme-color', SEO_SITE.themeColor);

    this.setProperty('og:type', 'website');
    this.setProperty('og:site_name', SEO_SITE.name);
    this.setProperty('og:locale', SEO_SITE.locale);
    this.setProperty('og:title', title);
    this.setProperty('og:description', description);
    this.setProperty('og:url', canonicalUrl);
    this.setProperty('og:image', imageUrl);
    this.setProperty('og:image:alt', imageAlt);

    this.setName('twitter:card', 'summary_large_image');
    this.setName('twitter:title', title);
    this.setName('twitter:description', description);
    this.setName('twitter:image', imageUrl);
    this.setName('twitter:image:alt', imageAlt);

    this.updateCanonical(canonicalUrl);
    this.updateAlternate('es', canonicalUrl);
    this.updateAlternate('x-default', canonicalUrl);
    this.updateJsonLd(canonicalUrl, title, description, imageUrl, seo);
  }

  private getDeepestRoute(
    route: ActivatedRouteSnapshot,
  ): ActivatedRouteSnapshot {
    let current = route;
    while (current.firstChild) {
      current = current.firstChild;
    }
    return current;
  }

  private getSeoData(route: ActivatedRouteSnapshot): SeoData | undefined {
    const value = route.data['seo'];
    if (!value || typeof value !== 'object') {
      return undefined;
    }

    const candidate = value as Partial<SeoData>;
    if (
      typeof candidate.title !== 'string' ||
      typeof candidate.description !== 'string' ||
      typeof candidate.canonicalPath !== 'string' ||
      !Array.isArray(candidate.keywords)
    ) {
      return undefined;
    }

    return candidate as SeoData;
  }

  private setName(name: string, content: string): void {
    this.meta.updateTag({ name, content }, `name="${name}"`);
  }

  private setProperty(property: string, content: string): void {
    this.meta.updateTag({ property, content }, `property="${property}"`);
  }

  private updateCanonical(href: string): void {
    let link = this.document.head.querySelector<HTMLLinkElement>(
      'link[rel="canonical"]',
    );
    if (!link) {
      link = this.document.createElement('link');
      link.setAttribute('rel', 'canonical');
      this.document.head.appendChild(link);
    }
    link.setAttribute('href', href);
  }

  private updateAlternate(hreflang: string, href: string): void {
    let link = this.document.head.querySelector<HTMLLinkElement>(
      `link[rel="alternate"][hreflang="${hreflang}"]`,
    );
    if (!link) {
      link = this.document.createElement('link');
      link.setAttribute('rel', 'alternate');
      link.setAttribute('hreflang', hreflang);
      this.document.head.appendChild(link);
    }
    link.setAttribute('href', href);
  }

  private updateJsonLd(
    canonicalUrl: string,
    title: string,
    description: string,
    imageUrl: string,
    seo: SeoData | undefined,
  ): void {
    const graph: Record<string, unknown>[] = [
      {
        '@type': 'Organization',
        '@id': `${SEO_SITE.url}/#organization`,
        name: SEO_SITE.name,
        url: SEO_SITE.url,
        logo: imageUrl,
        sameAs: [SEO_SITE.githubUrl],
      },
      {
        '@type': 'WebSite',
        '@id': `${SEO_SITE.url}/#website`,
        name: SEO_SITE.name,
        url: SEO_SITE.url,
        inLanguage: SEO_SITE.language,
        publisher: { '@id': `${SEO_SITE.url}/#organization` },
      },
      {
        '@type': 'WebPage',
        '@id': `${canonicalUrl}#webpage`,
        url: canonicalUrl,
        name: title,
        description,
        inLanguage: SEO_SITE.language,
        isPartOf: { '@id': `${SEO_SITE.url}/#website` },
        primaryImageOfPage: {
          '@type': 'ImageObject',
          url: imageUrl,
        },
      },
    ];

    if (seo?.breadcrumbs?.length) {
      graph.push(this.createBreadcrumbList(canonicalUrl, seo.breadcrumbs));
    }

    graph.push(...(seo?.jsonLd ?? []));

    this.setJsonLd('seo-structured-data', {
      '@context': 'https://schema.org',
      '@graph': graph,
    });
  }

  private createBreadcrumbList(
    canonicalUrl: string,
    breadcrumbs: readonly SeoBreadcrumb[],
  ): Record<string, unknown> {
    return {
      '@type': 'BreadcrumbList',
      '@id': `${canonicalUrl}#breadcrumb`,
      itemListElement: breadcrumbs.map((breadcrumb, index) => ({
        '@type': 'ListItem',
        position: index + 1,
        name: breadcrumb.name,
        item: this.absoluteUrl(breadcrumb.path),
      })),
    };
  }

  private setJsonLd(id: string, value: Record<string, unknown>): void {
    let script = this.document.getElementById(id) as HTMLScriptElement | null;
    if (!script) {
      script = this.document.createElement('script');
      script.id = id;
      script.type = 'application/ld+json';
      this.document.head.appendChild(script);
    }
    script.text = JSON.stringify(value);
  }

  private absoluteUrl(path: string): string {
    return new URL(path, SEO_SITE.url).toString();
  }

  private normalizePath(path: string): string {
    const cleanPath = path.split('?')[0]?.split('#')[0] ?? '/';
    return cleanPath.startsWith('/') ? cleanPath : `/${cleanPath}`;
  }
}
