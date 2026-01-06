import { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
    return {
        name: 'Questrade Tracker',
        short_name: 'InvTracker',
        description: 'Track your Questrade portfolio performance and dividends',
        start_url: '/',
        display: 'standalone',
        background_color: '#ffffff',
        theme_color: '#0a8043',
        icons: [
            {
                src: '/icon.png',
                sizes: '512x512',
                type: 'image/png',
            },
        ],
    };
}
