from PIL import Image, ImageDraw

def create_icon(size, path):
    img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    
    margin = int(size * 0.05)
    draw.ellipse([margin, margin, size-margin, size-margin], fill=(99, 102, 241, 255))
    
    inner_m = int(size * 0.15)
    draw.ellipse([inner_m, inner_m, size-inner_m, size-inner_m], fill=(139, 92, 246, 255))
    
    env_left = int(size * 0.22)
    env_right = int(size * 0.78)
    env_top = int(size * 0.32)
    env_bottom = int(size * 0.68)
    
    draw.rectangle([env_left, env_top, env_right, env_bottom], fill=(255, 255, 255, 240))
    
    center_x = size // 2
    draw.polygon([
        (env_left, env_top),
        (center_x, int(size * 0.52)),
        (env_right, env_top)
    ], fill=(230, 230, 255, 240))
    
    img.save(path)
    print(f'Created {path}')

create_icon(16, 'icons/icon16.png')
create_icon(48, 'icons/icon48.png')
create_icon(128, 'icons/icon128.png')
print('All icons created!')
