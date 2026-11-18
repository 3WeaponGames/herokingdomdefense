'use strict';
// Exact Creator 2.4.13 source transforms. This module never writes files.
const crypto=require('node:crypto');
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const PATCHES=[
  {
    "file": "cocos/editor-support/spine/SpineObject.h",
    "beforeSha256": "a744de0d5c1b09ea5630ff6509f194ed178f9e5fae297fad7a91b85309a8a25e",
    "afterSha256": "827c3c4a7ea4886e50da3086ecb52282c746bd86050797ae69004de7c521d7c8",
    "changes": [
      {
        "before": "\tvoid operator delete(void *p);\n\n\tvirtual ~SpineObject();",
        "after": "\tvoid operator delete(void *p);\n\n\t// Notify the existing binding owner without freeing inline member storage.\n\ttypedef void (*DisposeCallback)(void *);\n\tstatic void setInlineObjectDisposeCallback(DisposeCallback callback);\n\tstatic void notifyInlineObjectDisposed(void *object);\n\n\tvirtual ~SpineObject();"
      }
    ]
  },
  {
    "file": "cocos/editor-support/spine/SpineObject.cpp",
    "beforeSha256": "9812de55caf58b99e9dd370107008847191810e0c4df05597c9e83800f592f61",
    "afterSha256": "ce4e0173580e332d7cda0eb15a68e37366fc446bf25a60e68877791648d0fdd0",
    "changes": [
      {
        "before": "using namespace spine;\n\nvoid *SpineObject::operator new(size_t sz) {",
        "after": "using namespace spine;\n\nnamespace {\n\tSpineObject::DisposeCallback inlineObjectDisposeCallback = nullptr;\n}\n\nvoid SpineObject::setInlineObjectDisposeCallback(DisposeCallback callback) {\n\tinlineObjectDisposeCallback = callback;\n}\n\nvoid SpineObject::notifyInlineObjectDisposed(void *object) {\n\tif (inlineObjectDisposeCallback) inlineObjectDisposeCallback(object);\n}\n\nvoid *SpineObject::operator new(size_t sz) {"
      }
    ]
  },
  {
    "file": "cocos/editor-support/spine-creator-support/spine-cocos2dx.cpp",
    "beforeSha256": "8601daf99281226e44e8134c045ac972469cdc178bf42230966402305798da54",
    "afterSha256": "575d9f547c1724f6631dfaae0e199dd052c3d9d2adda2cbcc3037aa12bfcdde1",
    "changes": [
      {
        "before": "        _spineObjectDisposeCallback = callback;\n    }",
        "after": "        _spineObjectDisposeCallback = callback;\n        SpineObject::setInlineObjectDisposeCallback(callback);\n    }"
      }
    ]
  },
  {
    "file": "cocos/editor-support/spine/Skeleton.cpp",
    "beforeSha256": "c8ca82653e6845222931865bad5d33f37190a1ddc3fcd1df485c6036ecc0a928",
    "afterSha256": "9b8654a4d65d4e8c0ae2b9734db6b6f398a7f07d90ef7d7f330bad81d900eac8",
    "changes": [
      {
        "before": "\tContainerUtil::cleanUpVectorOfPointers(_pathConstraints);\n}",
        "after": "\tContainerUtil::cleanUpVectorOfPointers(_pathConstraints);\n\tSpineObject::notifyInlineObjectDisposed(&_color);\n}"
      }
    ]
  },
  {
    "file": "cocos/editor-support/spine/Slot.h",
    "beforeSha256": "a7717198ea858bfbd37b4806a4098d5f4182a3bafa5e477a97793c892d1fa5c0",
    "afterSha256": "f543416fe1f1b107847e877d7a2312aaf8dfa328c5fc4090460a0adba5f0ed5a",
    "changes": [
      {
        "before": "\tSlot(SlotData &data, Bone &bone);\n\n\tvoid setToSetupPose();",
        "after": "\tSlot(SlotData &data, Bone &bone);\n\n\tvirtual ~Slot();\n\n\tvoid setToSetupPose();"
      }
    ]
  },
  {
    "file": "cocos/editor-support/spine/Slot.cpp",
    "beforeSha256": "7868087146bc358020a965a949bcff75b7c34e2d339a98a147e1c0df7c252ee3",
    "afterSha256": "fc53d42f3ed9d64ec2bba2437f5b674aa0d22816d85ea7c9138161177e3f4d63",
    "changes": [
      {
        "before": "\tsetToSetupPose();\n}\n\nvoid Slot::setToSetupPose() {",
        "after": "\tsetToSetupPose();\n}\n\nSlot::~Slot() {\n\tSpineObject::notifyInlineObjectDisposed(&_darkColor);\n\tSpineObject::notifyInlineObjectDisposed(&_color);\n}\n\nvoid Slot::setToSetupPose() {"
      }
    ]
  },
  {
    "file": "cocos/editor-support/spine/SlotData.h",
    "beforeSha256": "b37575c4f8e8be5d45f39553b35824e94ac43a9248749c8d7a3a4038644dd0e3",
    "afterSha256": "a99a2c87b18a0cf0a644ceabf8fc90cd9c0a33682b2151addecd9da9645d5a92",
    "changes": [
      {
        "before": "\tSlotData(int index, const String &name, BoneData &boneData);\n\n\tint getIndex();",
        "after": "\tSlotData(int index, const String &name, BoneData &boneData);\n\n\tvirtual ~SlotData();\n\n\tint getIndex();"
      }
    ]
  },
  {
    "file": "cocos/editor-support/spine/SlotData.cpp",
    "beforeSha256": "1588fa4588c058531cb51586bb469854aab73c6e6ebd0b10cb11d7968c9add7f",
    "afterSha256": "f00486bcc6921f574644d6856ab334a6da97f8df916617cd20b83a90469108a3",
    "changes": [
      {
        "before": "\tassert(_name.length() > 0);\n}\n\nint SlotData::getIndex() {",
        "after": "\tassert(_name.length() > 0);\n}\n\nSlotData::~SlotData() {\n\tSpineObject::notifyInlineObjectDisposed(&_darkColor);\n\tSpineObject::notifyInlineObjectDisposed(&_color);\n}\n\nint SlotData::getIndex() {"
      }
    ]
  },
  {
    "file": "cocos/editor-support/spine/RegionAttachment.h",
    "beforeSha256": "ea9cc77a70e4cf6f0b0ae3e32cfd67505e3084613bf82c2367f372509fa54f1a",
    "afterSha256": "32f996482f47e1d913d32a55a06b2d98371a54d301f032dfd0ba0ba8e261f797",
    "changes": [
      {
        "before": "\t\texplicit RegionAttachment(const String& name);\n\n\t\tvoid updateOffset();",
        "after": "\t\texplicit RegionAttachment(const String& name);\n\n\t\tvirtual ~RegionAttachment();\n\n\t\tvoid updateOffset();"
      }
    ]
  },
  {
    "file": "cocos/editor-support/spine/RegionAttachment.cpp",
    "beforeSha256": "bf1fbb7da3f9d5d56e8c860a7ddd72040ae31eea3615bf42d5bb03604c11a32b",
    "afterSha256": "979d562fcc99ffa480926802f57ab8d2efb2ded49518e57ac4e862667930cb7a",
    "changes": [
      {
        "before": "\t_uvs.setSize(NUM_UVS, 0);\n}\n\nvoid RegionAttachment::updateOffset() {",
        "after": "\t_uvs.setSize(NUM_UVS, 0);\n}\n\nRegionAttachment::~RegionAttachment() {\n\tSpineObject::notifyInlineObjectDisposed(&_color);\n}\n\nvoid RegionAttachment::updateOffset() {"
      }
    ]
  },
  {
    "file": "cocos/editor-support/spine/MeshAttachment.cpp",
    "beforeSha256": "c9452ccbc9e583fdee7f30992ad6b2e901a700ecf0807c3e65f38b879ac18cea",
    "afterSha256": "dc4d5ba773fb1fd6c1d007cf08a0ce42e81b55179846ec64ca96918518b3f0b7",
    "changes": [
      {
        "before": "\nMeshAttachment::~MeshAttachment() {}\n",
        "after": "\nMeshAttachment::~MeshAttachment() {\n\tSpineObject::notifyInlineObjectDisposed(&_color);\n}\n"
      }
    ]
  }
];
for(const patch of PATCHES){for(const change of patch.changes)Object.freeze(change);Object.freeze(patch.changes);Object.freeze(patch);}Object.freeze(PATCHES);
function patchSource(before,patch){
 if(!Buffer.isBuffer(before))before=Buffer.from(before);
 if(sha(before)!==patch.beforeSha256)throw Error('Unsupported Spine cleanup source hash: '+patch.file);
 const original=before.toString('utf8');let text=original.replace(/\r\n/g,'\n');
 for(const change of patch.changes){if(!change.before||text.split(change.before).length!==2)throw Error('Unsupported Spine cleanup patch anchor: '+patch.file);text=text.replace(change.before,change.after);}
 const after=Buffer.from(original.includes('\r\n')?text.replace(/\n/g,'\r\n'):text);
 if(sha(after)!==patch.afterSha256)throw Error('Unexpected Spine cleanup result hash: '+patch.file);
 return after;
}
module.exports={PATCHES,patchSource};
