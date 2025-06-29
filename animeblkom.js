function searchResults(html) {
    if (typeof html !== 'string') {
        console.error('Invalid HTML input: expected a string.');
        return [];
    }

    const results = [];

    const itemRegex = /<div class="card-anime[^"]*"[^>]*>[\s\S]*?</div>/g;
    const titleRegex = /<h3[^>]*class="[^"]*title[^"]*"[^>]*>(.*?)<\/h3>/;
    const hrefRegex = /<a\s+href="([^"]+)"\s*[^>]*class="[^"]*card-anime-title[^"]*"[^>]*>/;
    const imgRegex = /<img[^>]*src="([^"]+)"[^>]*class="[^"]*card-anime-image[^"]*"[^>]*>/;

    const items = html.match(itemRegex) || [];

    items.forEach((itemHtml, index) => {
        try {
            if (typeof itemHtml !== 'string') {
                console.error(`Item ${index} is not a string.`);
                return;
            }

            const titleMatch = itemHtml.match(titleRegex);
            const title = titleMatch?.[1]?.trim() ?? '';

            const hrefMatch = itemHtml.match(hrefRegex);
            const href = hrefMatch?.[1]?.trim() ?? '';

            const imgMatch = itemHtml.match(imgRegex);
            const imageUrl = imgMatch?.[1]?.trim() ?? '';

            if (title && href) {
                results.push({
                    title: decodeHTMLEntities(title),
                    image: imageUrl || 'غير متوفر',
                    href: href
                });
            } else {
                console.error(`Missing title or href in item ${index}`);
            }
        } catch (err) {
            console.error(`Error processing item ${index}:`, err);
        }
    });

    console.log('Search Results:', results);
    return results;
}

function extractDetails(html) {
    const details = [];

    const containerMatch = html.match(/<div class="story[^"]*"[^>]*>\s*((?:<p[^>]*>[\s\S]*?</p>\s*)+)</div>/);

    let description = "";
    if (containerMatch) {
        const pBlock = containerMatch[1];
        const pRegex = /<p[^>]*>([\s\S]*?)<\/p>/g;
        const matches = [...pBlock.matchAll(pRegex)]
            .map(m => m[1].trim())
            .filter(text => text.length > 0);

        description = decodeHTMLEntities(matches.join("\n\n"));
    }

    const airdateMatch = html.match(/<div[^>]*class="[^"]*info-item[^"]*"[^>]*>\s*تاريخ الإصدار\s*:\s*([^<]+)</div>/);
    let airdate = airdateMatch ? airdateMatch[1].trim() : "";

    const genres = [];
    const genresMatch = html.match(/<div[^>]*class="[^"]*genres[^"]*"[^>]*>([\s\S]*?)<\/div>/);
    const inner = genresMatch ? genresMatch[1] : "";
    const anchorRe = /<a[^>]*>([^<]+)<\/a>/g;
    let m;
    while ((m = anchorRe.exec(inner)) !== null) {
        genres.push(m[1].trim());
    }

    if (description || airdate || genres.length > 0) {
        details.push({
            description: description || "غير متوفر",
            aliases: genres.join(", ") || "غير متوفر",
            airdate: airdate || "غير متوفر",
        });
    }

    console.log('Details:', details);
    return details;
}

function extractEpisodes(html) {
    const episodes = [];
    const htmlRegex = /<a\s+[^>]*href="([^"]*?\/watch\/[^"]*?)"[^>]*class="[^"]*episodes-card[^"]*"[^>]*>[\s\S]*?الحلقة\s+(\d+)[\s\S]*?</a>/g;

    let matches;
    if ((matches = html.match(htmlRegex))) {
        matches.forEach(link => {
            const hrefMatch = link.match(/href="([^"]+)"/);
            const numberMatch = link.match(/الحلقة\s+(\d+)/);
            if (hrefMatch && numberMatch) {
                const href = hrefMatch[1];
                const number = numberMatch[1];
                episodes.push({
                    href: href,
                    number: number
                });
            }
        });
    }

    console.log('Episodes:', episodes);
    return episodes;
}

async function extractStreamUrl(html) {
    try {
        const sourceMatch = html.match(/data-source="([^"]+)"/);
        let embedUrl = sourceMatch?.[1]?.replace(/&/g, '&');
        if (!embedUrl) {
            console.error('No video source found');
            return null;
        }

        const response = await fetch(embedUrl);
        const data = await response.text();
        console.log('Embed page HTML:', data);

        const qualities = extractQualities(data);

        const epMatch = html.match(/<title>[^<]*الحلقة\s*(\d+)[^<]*<\/title>/);
        const currentEp = epMatch ? Number(epMatch[1]) : null;

        let nextEpNum, nextDuration, nextSubtitle;
        if (currentEp !== null) {
            const episodeRegex = /<a[^>]+href="[^"]+\/watch\/[^\/]+\/(\d+)"[\s\S]*?<span[^>]*class="[^"]*ep-title[^"]*"[^>]*>([^<]+)<\/span>[\s\S]*?<p[^>]*class="[^"]*ep-subtitle[^"]*"[^>]*>([^<]+)<\/p>/g;
            let m;
            while ((m = episodeRegex.exec(html)) !== null) {
                const num = Number(m[1]);
                if (num > currentEp) {
                    nextEpNum = num;
                    nextDuration = m[2].trim();
                    nextSubtitle = m[3].trim();
                    break;
                }
            }
        }

        if (nextEpNum != null) {
            embedUrl += `&next-title=${encodeURIComponent(nextDuration)}`;
            embedUrl += `&next-sub-title=${encodeURIComponent(nextSubtitle)}`;
        }

        const result = {
            streams: qualities,
        };

        console.log('Stream URL Result:', JSON.stringify(result));
        return JSON.stringify(result);
    } catch (err) {
        console.error('Error in extractStreamUrl:', err);
        return null;
    }
}

function extractQualities(html) {
    const match = html.match(/var\s+sources\s*=\s*(\[[\s\S]*?\]);/);
    if (!match) {
        console.error('No sources array found');
        return [];
    }

    const raw = match[1];
    const regex = /\{\s*src:\s*'([^']+)'\s*[^}]*label:\s*'([^']*)'/g;
    const list = [];
    let m;

    while ((m = regex.exec(raw)) !== null) {
        list.push(m[2], m[1]);
    }

    console.log('Qualities:', list);
    return list;
}

function decodeHTMLEntities(text) {
    text = text.replace(/&#(\d+);/g, (match, dec) => String.fromCharCode(dec));

    const entities = {
        '"': '"',
        '&': '&',
        ''': "'",
        '<': '<',
        '>': '>',
        ' ': ' '
    };

    for (const entity in entities) {
        text = text.replace(new RegExp(entity, 'g'), entities[entity]);
    }

    return text;
}
