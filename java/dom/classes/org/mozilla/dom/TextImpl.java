/* 
 The contents of this file are subject to the Mozilla Public
 License Version 1.1 (the "License"); you may not use this file
 except in compliance with the License. You may obtain a copy of
 the License at http://www.mozilla.org/MPL/

 Software distributed under the License is distributed on an "AS
 IS" basis, WITHOUT WARRANTY OF ANY KIND, either express or
 implied. See the License for the specific language governing
 rights and limitations under the License.

 The Original Code is mozilla.org code.

 The Initial Developer of the Original Code is Sun Microsystems,
 Inc. Portions created by Sun are
 Copyright (C) 1999 Sun Microsystems, Inc. All
 Rights Reserved.

 Contributor(s): 
*/

package org.mozilla.dom;

import org.w3c.dom.DOMException;
import org.w3c.dom.Text;

public class TextImpl extends CharacterDataImpl implements Text {

    // instantiated from JNI or Document.createTextNode()
    protected TextImpl() {}

    public native Text splitText(int offset);

    public Text replaceWholeText(String content) throws DOMException {
        throw new UnsupportedOperationException();
    }

    public String getWholeText() {
        throw new UnsupportedOperationException();
    }

    public boolean isElementContentWhitespace() {
        throw new UnsupportedOperationException();
    }
}    

