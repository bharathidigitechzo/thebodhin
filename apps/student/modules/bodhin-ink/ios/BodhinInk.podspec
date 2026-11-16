Pod::Spec.new do |s|
  s.name           = 'BodhinInk'
  s.version        = '0.1.0'
  s.summary        = 'ML Kit Digital Ink handwriting recognition for the Bodhin smart board'
  s.author         = 'Bodhin'
  s.homepage       = 'https://thebodhin.com'
  s.license        = 'UNLICENSED'
  s.platforms      = { :ios => '15.1' }
  s.source         = { :git => '' }
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.dependency 'GoogleMLKit/DigitalInkRecognition', '~> 7.0'
  s.source_files = '**/*.swift'
end
